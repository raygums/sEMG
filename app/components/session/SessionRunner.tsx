'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Hand, Wifi, XCircle } from 'lucide-react'
import { audioCue } from '@/app/lib/audioCue'
import { useOptimizedTimer } from '@/app/lib/useOptimizedTimer'
import type { PhaseType, SessionEvent, SessionStatus } from '@/app/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionData {
  id: string
  status: SessionStatus
  gesture: {
    id: string
    name: string
    label: string
    videoUrl: string | null
  }
  config: {
    preparationDuration: number
    actionDuration: number
    restDuration: number
    repetitionCount: number
  }
  participantName: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 500

const PHASE_COLORS: Record<PhaseType, { bg: string; border: string; glow: string; text: string; label: string }> = {
  PREPARATION: {
    bg: 'rgba(6, 182, 212, 0.08)',
    border: 'rgba(6, 182, 212, 0.5)',
    glow: '0 0 40px rgba(6, 182, 212, 0.25), 0 0 80px rgba(6, 182, 212, 0.1)',
    text: '#06b6d4',
    label: 'PERSIAPAN',
  },
  ACTION: {
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.5)',
    glow: '0 0 40px rgba(16, 185, 129, 0.25), 0 0 80px rgba(16, 185, 129, 0.1)',
    text: '#10b981',
    label: 'AKSI — TAHAN POSE',
  },
  REST: {
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.5)',
    glow: '0 0 40px rgba(245, 158, 11, 0.25), 0 0 80px rgba(245, 158, 11, 0.1)',
    text: '#f59e0b',
    label: 'ISTIRAHAT — RELAKSASI',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionRunner — Participant View (100% view-only, no control buttons)
// Starts automatically when the admin PATCHes status → "running".
// ─────────────────────────────────────────────────────────────────────────────

export default function SessionRunner({ session }: { session: SessionData }) {
  const router = useRouter()
  const { config, gesture } = session

  // ── Core state ──────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState<PhaseType>('PREPARATION')
  const [phaseDuration, setPhaseDuration] = useState(config.preparationDuration)
  const [repetition, setRepetition]     = useState(1)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [isFinished, setIsFinished]     = useState(false)
  const [isAborted, setIsAborted]       = useState(false)
  const [countdown, setCountdown]       = useState<number | null>(null)
  const [pollStatus, setPollStatus]     = useState<'idle' | 'polling' | 'error'>('idle')

  // ── Mutable refs (avoid stale closures / unnecessary re-renders) ────────────
  const phaseRef         = useRef<PhaseType>('PREPARATION')
  const repetitionRef    = useRef(1)
  const phaseDurationRef = useRef(config.preparationDuration)  // mirrors phaseDuration state
  const audioInitRef     = useRef(false)
  const cueFiredRef      = useRef(false)   // per-phase audio cue guard
  const eventsRef        = useRef<SessionEvent[]>([])
  const videoRef         = useRef<HTMLVideoElement>(null)
  const phaseProgressRef = useRef<HTMLDivElement>(null)

  // Stable callback ref pattern — lets nextPhase be stable for useOptimizedTimer
  const nextPhaseCallbackRef = useRef<() => void>(() => {})

  // ── Utility ─────────────────────────────────────────────────────────────────

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms   = Math.floor((seconds % 1) * 100)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
  }

  // ── Event logging ────────────────────────────────────────────────────────────

  const logEvent = useCallback(
    (eventType: string, rep?: number, meta?: Record<string, unknown>) => {
      const event: SessionEvent = {
        eventType: eventType as SessionEvent['eventType'],
        repetitionNum: rep,
        clientTimestamp: performance.now(),
        metadata: { gestureName: gesture.name, gestureLabel: gesture.label, sessionId: session.id, ...meta },
      }
      eventsRef.current.push(event)

      if (eventType === 'PHASE_ACTION') {
        // Fire-and-forget trigger for DAQ synchronisation
        fetch('/api/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType, sessionId: session.id, gestureName: gesture.name, repetitionNum: rep, clientTimestamp: event.clientTimestamp }),
        }).catch(() => {})
      }
    },
    [gesture.name, gesture.label, session.id],
  )

  const flushEvents = useCallback(async () => {
    if (eventsRef.current.length === 0) return
    const events = [...eventsRef.current]
    eventsRef.current = []
    try {
      await fetch(`/api/sessions/${session.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      })
    } catch {
      eventsRef.current = [...events, ...eventsRef.current] // re-queue on failure
    }
  }, [session.id])

  // ── Phase transition (called by useOptimizedTimer's onComplete) ──────────────

  const nextPhase = useCallback(() => {
    const currentPhase = phaseRef.current
    const currentRep   = repetitionRef.current

    if (currentPhase === 'PREPARATION') {
      phaseRef.current = 'ACTION'
      phaseDurationRef.current = config.actionDuration
      cueFiredRef.current = false
      setPhase('ACTION')
      setPhaseDuration(config.actionDuration)
      logEvent('PHASE_ACTION', currentRep, { phaseDuration: config.actionDuration })

    } else if (currentPhase === 'ACTION') {
      phaseRef.current = 'REST'
      phaseDurationRef.current = config.restDuration
      cueFiredRef.current = false
      if (videoRef.current) videoRef.current.pause()
      setPhase('REST')
      setPhaseDuration(config.restDuration)
      logEvent('PHASE_REST',  currentRep, { phaseDuration: config.restDuration })
      logEvent('REPETITION_END', currentRep)
      flushEvents()

    } else {
      // REST → next repetition or finish
      if (currentRep >= config.repetitionCount) {
        logEvent('SESSION_END', currentRep)
        fetch(`/api/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        }).catch(() => {})
        flushEvents()
        setIsTimerRunning(false)
        setIsFinished(true)
        return
      }

      const nextRep = currentRep + 1
      repetitionRef.current = nextRep
      phaseRef.current = 'PREPARATION'
      phaseDurationRef.current = config.preparationDuration
      cueFiredRef.current = false

      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }

      setRepetition(nextRep)
      setPhase('PREPARATION')
      setPhaseDuration(config.preparationDuration)
      logEvent('REPETITION_START', nextRep)
      logEvent('PHASE_PREPARATION', nextRep, { phaseDuration: config.preparationDuration })
    }
  }, [config, logEvent, flushEvents, session.id])

  // Keep the ref in sync so the stable callback always calls the latest version
  nextPhaseCallbackRef.current = nextPhase

  // ── Stable callbacks for useOptimizedTimer (deps never change → no restarts) ─

  const stableOnComplete = useCallback(() => {
    nextPhaseCallbackRef.current()
  }, [])

  const stableOnTimeUpdate = useCallback((remaining: number) => {
    // Direct DOM update — zero React re-renders
    if (phaseProgressRef.current) {
      const elapsed   = phaseDurationRef.current - remaining
      const pct       = Math.min(100, Math.max(0, (elapsed / phaseDurationRef.current) * 100))
      phaseProgressRef.current.style.width = `${pct}%`
    }

    // Audio cue ~1 s before phase ends (fires once per phase)
    if (remaining <= 1.0 && remaining > 0.05 && !cueFiredRef.current) {
      cueFiredRef.current = true
      if (audioInitRef.current) audioCue.playDoubleBip()
    }
  }, [])

  // ── useOptimizedTimer integration ────────────────────────────────────────────
  // Changing `phaseDuration` state causes the hook to restart the internal worker
  // automatically with the new duration — perfect for phase transitions.

  const { timerDisplayRef } = useOptimizedTimer({
    duration:     phaseDuration,
    isRunning:    isTimerRunning,
    onTimeUpdate: stableOnTimeUpdate,
    onComplete:   stableOnComplete,
  })

  // ── Periodic event flush ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isTimerRunning) return
    const id = setInterval(flushEvents, 5_000)
    return () => clearInterval(id)
  }, [isTimerRunning, flushEvents])

  // ── Short-polling: wait for admin to set status → "running" ─────────────────
  // Stops as soon as session transitions out of "pending".

  useEffect(() => {
    // Already running/finished — no polling needed
    if (isTimerRunning || isFinished || isAborted || countdown !== null) return
    if (session.status === 'running') {
      // Session was already running when component mounted (e.g. page refresh)
      beginSession()
      return
    }

    setPollStatus('polling')

    const intervalId = setInterval(async () => {
      try {
        const res  = await fetch(`/api/sessions/${session.id}`)
        if (!res.ok) { setPollStatus('error'); return }
        const data = await res.json() as { status: SessionStatus }

        if (data.status === 'running') {
          clearInterval(intervalId)
          setPollStatus('idle')
          beginSession()
        } else if (data.status === 'aborted') {
          clearInterval(intervalId)
          setPollStatus('idle')
          setIsAborted(true)
        }
      } catch {
        setPollStatus('error')
      }
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
      setPollStatus('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimerRunning, isFinished, isAborted, countdown])

  // ── beginSession: called once when polling detects status === "running" ──────

  function beginSession() {
    // Initialise audio (browser autoplay policy requires a user gesture OR
    // a trusted event; the admin's PATCH counts as a server-side trigger so
    // we init here silently — audio will work because the participant page was
    // already open and interacted with.)
    audioCue.initializeAudioContext()
    audioInitRef.current = true

    // Request fullscreen on participant display
    try {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } catch { /* not available */ }

    setCountdown(3)
  }

  // ── Countdown effect ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      phaseRef.current      = 'PREPARATION'
      repetitionRef.current = 1
      phaseDurationRef.current = config.preparationDuration
      cueFiredRef.current   = false

      logEvent('SESSION_START',       1)
      logEvent('REPETITION_START',    1)
      logEvent('PHASE_PREPARATION',   1, { phaseDuration: config.preparationDuration })

      setIsTimerRunning(true)
      return
    }
    const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1_000)
    return () => clearTimeout(t)
  }, [countdown, config.preparationDuration, logEvent])

  // ── Progress calculations (React-driven, only changes on phase transitions) ──

  const totalPhases     = config.repetitionCount * 3
  const completedPhases = (repetition - 1) * 3 +
    (phase === 'PREPARATION' ? 0 : phase === 'ACTION' ? 1 : 2)
  const totalProgress   = (completedPhases / totalPhases) * 100
  const phaseStyle      = PHASE_COLORS[phase]

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER STATES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Countdown overlay ────────────────────────────────────────────────────────
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Bersiap...</p>
          <div className="text-9xl font-bold animate-countdown" key={countdown} style={{ color: 'var(--color-accent)' }}>
            {countdown}
          </div>
          <p className="mt-6 text-lg" style={{ color: 'var(--text-secondary)' }}>{gesture.label}</p>
        </div>
      </div>
    )
  }

  // ── Finished overlay ─────────────────────────────────────────────────────────
  if (isFinished) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-md animate-slide-up">
          <CheckCircle2 strokeWidth={1.5} className="w-20 h-20 text-emerald-400 drop-shadow-xl mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-action)' }}>Sesi Selesai!</h1>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Gesture: {gesture.label}</p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{config.repetitionCount} repetisi berhasil direkam</p>
          <div className="flex gap-3 justify-center">
            <button className="btn btn-primary" onClick={() => router.push('/session')}>Sesi Baru</button>
            <button className="btn btn-secondary" onClick={() => router.push('/admin/sessions')}>Lihat Riwayat</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Aborted overlay ──────────────────────────────────────────────────────────
  if (isAborted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-md animate-slide-up">
          <XCircle strokeWidth={1.5} className="w-20 h-20 text-red-400 drop-shadow-xl mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-danger)' }}>Sesi Dihentikan</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Peneliti telah menghentikan sesi ini. Silakan hubungi peneliti.
          </p>
          <button className="btn btn-secondary" onClick={() => router.push('/session')}>Kembali</button>
        </div>
      </div>
    )
  }

  // ── Waiting screen (polling, pending) ────────────────────────────────────────
  if (!isTimerRunning) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-lg animate-fade-in w-full mx-4">
          {/* Icon */}
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-preparation))' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Sesi Akuisisi Data</h1>
          <p className="text-lg mb-1" style={{ color: 'var(--color-accent)' }}>{gesture.label}</p>
          {session.participantName && (
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Partisipan: {session.participantName}</p>
          )}

          {/* Config summary */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Persiapan', value: `${config.preparationDuration}s`, color: 'var(--color-preparation)' },
              { label: 'Aksi',      value: `${config.actionDuration}s`,      color: 'var(--color-action)' },
              { label: 'Istirahat', value: `${config.restDuration}s`,        color: 'var(--color-rest)' },
              { label: 'Repetisi',  value: `${config.repetitionCount}×`,     color: 'var(--color-accent)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-lg font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Polling indicator */}
          <div className="flex items-center justify-center gap-2 mt-2">
            {pollStatus === 'error' ? (
              <>
                <Wifi className="w-4 h-4 text-red-400 animate-pulse" />
                <span className="text-sm" style={{ color: 'var(--color-danger)' }}>Gagal terhubung — mencoba ulang...</span>
              </>
            ) : (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: 'var(--color-accent)' }} />
                  <span className="relative inline-flex rounded-full h-3 w-3"
                    style={{ background: 'var(--color-accent)' }} />
                </span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Menunggu peneliti memulai sesi...
                </span>
              </>
            )}
          </div>

          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Pastikan sensor EMG sudah terpasang dengan benar
          </p>
        </div>
      </div>
    )
  }

  // ── Main session runner UI ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 flex flex-col transition-all duration-500"
      style={{ background: phaseStyle.bg, borderTop: `4px solid ${phaseStyle.border}` }}
    >
      {/* Phase banner */}
      <div
        className="text-center py-3 transition-all duration-500"
        style={{ background: phaseStyle.border, boxShadow: phaseStyle.glow }}
      >
        <h2 className="text-lg font-bold tracking-widest uppercase animate-pulse-glow" style={{ color: '#fff' }}>
          {phaseStyle.label}
        </h2>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Video */}
        <div
          className="w-full max-w-3xl rounded-2xl overflow-hidden transition-all duration-500"
          style={{ border: `2px solid ${phaseStyle.border}`, boxShadow: phaseStyle.glow, aspectRatio: '16/9', background: '#000' }}
        >
          {gesture.videoUrl ? (
            <video
              ref={videoRef}
              src={gesture.videoUrl}
              className={`w-full h-full object-contain transition-all duration-700 ease-in-out
                ${phase === 'REST'   ? 'opacity-0 scale-95'  : 'opacity-100'}
                ${phase === 'ACTION' ? 'scale-[1.03] brightness-110' : 'scale-100 brightness-75'}`}
              loop muted playsInline preload="auto" autoPlay
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Hand strokeWidth={1.5} className="w-16 h-16 text-gray-500 mb-3" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{gesture.label}</p>
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="flex items-center justify-between w-full max-w-3xl mt-6">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Repetisi</p>
              <p className="text-2xl font-bold" style={{ color: phaseStyle.text }}>
                {repetition} <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>/ {config.repetitionCount}</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Gesture</p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{gesture.label}</p>
            </div>
          </div>

          {/* Timer — direct DOM update via timerDisplayRef, zero re-renders */}
          <p
            ref={timerDisplayRef as React.RefObject<HTMLParagraphElement>}
            className="text-4xl font-mono font-bold tracking-tight"
            style={{ color: phaseStyle.text }}
          >
            {formatTime(phaseDuration)}
          </p>
        </div>

        {/* Progress bars */}
        <div className="w-full max-w-3xl mt-6 space-y-3">
          {/* Phase progress — direct DOM update via phaseProgressRef */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Sisa Waktu Fase</span>
              <span style={{ color: phaseStyle.text }}>{phaseStyle.label}</span>
            </div>
            <div className="progress-bar">
              <div
                ref={phaseProgressRef}
                className="progress-bar-fill"
                style={{ width: '0%', background: `linear-gradient(90deg, ${phaseStyle.text}, ${phaseStyle.border})` }}
              />
            </div>
          </div>

          {/* Total progress — React-driven (only changes on phase transitions) */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Progres Sesi Total</span>
              <span style={{ color: 'var(--color-accent)' }}>{Math.round(totalProgress)}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${totalProgress}%`, background: 'linear-gradient(90deg, var(--color-accent), var(--color-preparation))' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar — info only, no control buttons */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${phaseStyle.border}` }}>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {session.participantName && `Partisipan: ${session.participantName} · `}
          Sesi: {session.id.slice(-8)}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Perekaman aktif
        </div>
      </div>
    </div>
  )
}
