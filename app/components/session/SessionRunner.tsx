'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { PhaseType, SessionEvent } from '@/app/lib/types'

interface SessionData {
  id: string
  status: 'pending' | 'running' | 'completed' | 'aborted'
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

// ── Python Bridge (local API, lihat emg_bridge.py) ───────────────────────────
const BRIDGE_BASE_URL = 'http://localhost:8000'
// Jangan kirim PUT /phase lebih sering dari ini KECUALI phase berubah (lihat
// reportPhaseToBridge) -- transition guard presisinya ditangani di bridge,
// throttle ini cuma mengurangi request HTTP redundan saat phase belum berubah.
const PHASE_REPORT_THROTTLE_MS = 100

export default function SessionRunner({ session }: { session: SessionData }) {
  const { config, gesture } = session

  // ── Core session state ─────────────────────────────────────────────────────
  const [phase, setPhase] = useState<PhaseType>('PREPARATION')
  const [repetition, setRepetition] = useState(1)
  const [timeRemaining, setTimeRemaining] = useState(config.preparationDuration)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)

  // ── Countdown states ───────────────────────────────────────────────────────
  // Pre-start countdown (3,2,1 setelah admin klik Mulai)
  const [startCountdown, setStartCountdown] = useState<number | null>(null)
  // Phase transition countdown (3,2,1 sebelum ACTION)
  const [phaseCountdown, setPhaseCountdown] = useState<number | null>(null)
  // Whether we're blocked waiting for phase countdown to finish
  const phaseCountdownPendingRef = useRef(false)

  // ── Admin control & connectivity ───────────────────────────────────────────
  // 'waiting' = poll DB for status=running, 'aborted-remote' = aborted by admin
  const [screenState, setScreenState] = useState<'waiting' | 'countdown' | 'running' | 'aborted-remote' | 'finished'>('waiting')

  // ── Refs ───────────────────────────────────────────────────────────────────
  const eventsRef = useRef<SessionEvent[]>([])
  const startTimeRef = useRef<number>(0)
  const phaseStartRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const sessionStartedRef = useRef(false) // prevent double-start on re-render
  const repetitionRef = useRef(1) // mirror of repetition state, readable in callbacks without stale closure
  const lastReportedPhaseRef = useRef<PhaseType | null>(null)
  const lastPhaseReportTimeRef = useRef(0)

  // Phase durations
  const getPhaseDuration = useCallback((p: PhaseType) => {
    switch (p) {
      case 'PREPARATION': return config.preparationDuration
      case 'ACTION': return config.actionDuration
      case 'REST': return config.restDuration
    }
  }, [config])

  // Log event
  const logEvent = useCallback((eventType: string, rep?: number, meta?: Record<string, unknown>) => {
    const event: SessionEvent = {
      eventType: eventType as SessionEvent['eventType'],
      repetitionNum: rep,
      clientTimestamp: Date.now(),
      metadata: {
        gestureName: gesture.name,
        gestureLabel: gesture.label,
        sessionId: session.id,
        ...meta,
      },
    }
    eventsRef.current.push(event)

    const GATEWAY_RELEVANT_EVENTS = ['PHASE_ACTION', 'SESSION_START', 'SESSION_END', 'SESSION_ABORT']
    if (GATEWAY_RELEVANT_EVENTS.includes(eventType)) {
      fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          sessionId: session.id,
          gestureName: gesture.name,
          repetitionNum: rep,
          clientTimestamp: event.clientTimestamp,
        }),
      }).catch(() => {})
    }
  }, [gesture, session.id])

  // Report active phase to Python Bridge local API (Web-Driven Labeling).
  // Fire-and-forget: kegagalan di sini TIDAK boleh menghentikan Master Clock
  // Next.js -- bridge yang belum jalan tidak boleh menggagalkan sesi.
  const reportPhaseToBridge = useCallback((currentPhase: PhaseType) => {
    const now = performance.now()
    const phaseChanged = currentPhase !== lastReportedPhaseRef.current
    const throttleElapsed = now - lastPhaseReportTimeRef.current >= PHASE_REPORT_THROTTLE_MS

    // Selalu kirim segera saat phase BERUBAH (supaya transition guard di
    // bridge dapat sinyal secepat mungkin); throttle hanya saat phase SAMA.
    if (!phaseChanged && !throttleElapsed) return

    lastReportedPhaseRef.current = currentPhase
    lastPhaseReportTimeRef.current = now

    fetch(`${BRIDGE_BASE_URL}/phase`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, phase: currentPhase }),
    }).catch(() => {
      // Diamkan -- bridge mungkin belum dijalankan operator, itu tidak
      // boleh menghentikan linimasa Web yang sedang berjalan.
    })
  }, [session.id])

  const notifyBridgeSessionStart = useCallback(() => {
    fetch(`${BRIDGE_BASE_URL}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    }).catch(() => {})
  }, [session.id])

  const notifyBridgeSessionEnd = useCallback(() => {
    fetch(`${BRIDGE_BASE_URL}/session/end`, { method: 'POST' }).catch(() => {})
  }, [])

  // Flush events to server
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
      eventsRef.current = [...events, ...eventsRef.current]
    }
  }, [session.id])

  // Transition to next phase (with PREP→ACTION countdown)
  const nextPhase = useCallback((currentPhase: PhaseType, currentRep: number) => {
    if (currentPhase === 'PREPARATION') {
      // Trigger phase transition countdown before ACTION
      phaseCountdownPendingRef.current = true
      setPhaseCountdown(3)
    } else if (currentPhase === 'ACTION') {
      setPhase('REST')
      setTimeRemaining(config.restDuration)
      phaseStartRef.current = performance.now()
      logEvent('PHASE_REST', currentRep, { phaseDuration: config.restDuration })
      logEvent('REPETITION_END', currentRep)
    } else if (currentPhase === 'REST') {
      if (currentRep >= config.repetitionCount) {
        logEvent('SESSION_END', currentRep)
        notifyBridgeSessionEnd()
        setIsFinished(true)
        setIsRunning(false)
        setScreenState('finished')
        fetch(`/api/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        })
        flushEvents()
        return
      }
      const nextRep = currentRep + 1
      setRepetition(nextRep)
      repetitionRef.current = nextRep
      setPhase('PREPARATION')
      setTimeRemaining(config.preparationDuration)
      phaseStartRef.current = performance.now()
      logEvent('REPETITION_START', nextRep)
      logEvent('PHASE_PREPARATION', nextRep, { phaseDuration: config.preparationDuration })

      // Restart video for new repetition
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }
    }
  }, [config, logEvent, flushEvents, session.id, notifyBridgeSessionEnd])

  // ── Phase transition countdown (PREP → ACTION) ─────────────────────────────
  useEffect(() => {
    if (phaseCountdown === null) return

    if (phaseCountdown === 0) {
      // Countdown done — transition to ACTION
      setPhaseCountdown(null)
      phaseCountdownPendingRef.current = false

      // Transition happens here, after countdown
      setPhase('ACTION')
      setTimeRemaining(config.actionDuration)
      phaseStartRef.current = performance.now()
      reportPhaseToBridge('ACTION')
      // Log with current repetition value via ref (safe from stale closure)
      logEvent('PHASE_ACTION', repetitionRef.current, { phaseDuration: config.actionDuration })

      // Play video when ACTION starts
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }
      return
    }

    const timer = setTimeout(() => setPhaseCountdown(c => (c !== null ? c - 1 : null)), 1000)
    return () => clearTimeout(timer)
  }, [phaseCountdown, config.actionDuration, logEvent, reportPhaseToBridge])

  // ── Main timer loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || isFinished) return

    let lastPhase = phase
    let lastRep = repetition
    let lastFrameTime = performance.now()

    const tick = () => {
      const now = performance.now()
      const frameDelta = now - lastFrameTime
      lastFrameTime = now

      // Freeze during phase countdown (PREP -> ACTION transition)
      if (phaseCountdownPendingRef.current) {
        phaseStartRef.current += frameDelta
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const elapsed = (now - phaseStartRef.current) / 1000
      const duration = getPhaseDuration(lastPhase)
      const remaining = Math.max(0, duration - elapsed)

      setTimeRemaining(remaining)
      reportPhaseToBridge(lastPhase)

      if (remaining <= 0) {
        nextPhase(lastPhase, lastRep)

        // Update local tracking
        if (lastPhase === 'PREPARATION') {
          // Will become ACTION after phase countdown — keep as PREPARATION until countdown done
          // The phaseCountdown useEffect will handle the actual state transition
          // So we do NOT update lastPhase to ACTION here yet
          // Instead mark as pending and let the RAF pause itself
          lastPhase = 'ACTION' // local only — so next tick we don't call nextPhase again
        } else if (lastPhase === 'ACTION') {
          lastPhase = 'REST'
        } else if (lastPhase === 'REST') {
          if (lastRep >= config.repetitionCount) return
          lastPhase = 'PREPARATION'
          lastRep += 1
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isRunning, isFinished, phase, repetition, getPhaseDuration, nextPhase, config.repetitionCount, reportPhaseToBridge])

  // ── Periodic flush ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(flushEvents, 5000)
    return () => clearInterval(interval)
  }, [isRunning, flushEvents])

  // ── Poll session status from DB (admin control) ────────────────────────────
  // While waiting: detect when admin starts (status → running)
  // While running: detect when admin aborts (status → aborted)
  useEffect(() => {
    if (screenState === 'finished' || screenState === 'aborted-remote') return

    let cancelled = false

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`, {
          headers: { 'Cache-Control': 'no-store' },
        })
        if (!res.ok || cancelled) return
        const data = await res.json() as { status: string }

        if (screenState === 'waiting' && data.status === 'running') {
          // Admin started the session — begin pre-start countdown
          if (!sessionStartedRef.current) {
            sessionStartedRef.current = true
            setScreenState('countdown')
            setStartCountdown(3)
          }
        } else if (screenState === 'running' && data.status === 'aborted') {
          // Admin aborted — stop session immediately
          cancelled = true
          cancelAnimationFrame(rafRef.current)
          setIsRunning(false)
          setScreenState('aborted-remote')
          notifyBridgeSessionEnd()
          flushEvents()
        }
      } catch { /* ignore */ }
    }

    pollStatus()
    const interval = setInterval(pollStatus, 1500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [screenState, session.id, flushEvents, notifyBridgeSessionEnd])

  // ── Pre-start countdown (3,2,1 → GO!) ─────────────────────────────────────
  useEffect(() => {
    if (startCountdown === null) return
    if (startCountdown === 0) {
      setStartCountdown(null)
      setIsRunning(true)
      setScreenState('running')
      startTimeRef.current = performance.now()
      phaseStartRef.current = performance.now()

      logEvent('SESSION_START', 1)
      logEvent('REPETITION_START', 1)
      logEvent('PHASE_PREPARATION', 1, { phaseDuration: config.preparationDuration })
      notifyBridgeSessionStart()
      reportPhaseToBridge('PREPARATION')

      // Video starts during PREPARATION, not ACTION
      // Autoplay on first PREP
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }
      return
    }
    const timer = setTimeout(() => setStartCountdown(c => (c !== null ? c - 1 : null)), 1000)
    return () => clearTimeout(timer)
  }, [startCountdown, config.preparationDuration, logEvent, notifyBridgeSessionStart, reportPhaseToBridge])

  // ── Auto-play video after remounts ────────────────────────────────────────
  useEffect(() => {
    if (screenState === 'running' && phaseCountdown === null && phase !== 'REST') {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {})
      }
    }
  }, [screenState, phaseCountdown, phase, repetition])

  // ── Render helpers ─────────────────────────────────────────────────────────
  const phaseDuration = getPhaseDuration(phase)
  const phaseProgress = phaseDuration > 0 ? ((phaseDuration - timeRemaining) / phaseDuration) * 100 : 0
  const totalPhases = config.repetitionCount * 3
  const completedPhases = (repetition - 1) * 3 + (phase === 'PREPARATION' ? 0 : phase === 'ACTION' ? 1 : 2)
  const totalProgress = (completedPhases / totalPhases) * 100
  const phaseStyle = PHASE_COLORS[phase]

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
  }

  // ── SCREEN: Waiting for admin ──────────────────────────────────────────────
  if (screenState === 'waiting') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-lg animate-fade-in">
          {/* Animated pulse ring */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ background: 'var(--color-accent)' }}
            />
            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-preparation))' }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Layar Partisipan
          </h1>
          <p className="text-lg mb-1" style={{ color: 'var(--color-accent)' }}>
            {gesture.label}
          </p>
          {session.participantName && (
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Partisipan: {session.participantName}
            </p>
          )}
          <div
            className="rounded-xl px-6 py-4 mb-6"
            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.3)' }}
          >
            <p className="text-sm font-medium" style={{ color: '#06b6d4' }}>
              ⏳ Menunggu admin memulai sesi...
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Jangan tutup halaman ini. Sesi akan otomatis dimulai.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Persiapan', value: `${config.preparationDuration}s`, color: 'var(--color-preparation)' },
              { label: 'Aksi', value: `${config.actionDuration}s`, color: 'var(--color-action)' },
              { label: 'Istirahat', value: `${config.restDuration}s`, color: 'var(--color-rest)' },
              { label: 'Repetisi', value: `${config.repetitionCount}×`, color: 'var(--color-accent)' },
            ].map(item => (
              <div key={item.label} className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }



  // ── SCREEN: Aborted by admin ───────────────────────────────────────────────
  if (screenState === 'aborted-remote') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-md animate-slide-up">
          <div className="text-6xl mb-4">🛑</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#ef4444' }}>
            Sesi Dihentikan
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Admin telah menghentikan sesi ini. Tunggu instruksi selanjutnya.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Sesi: {session.id.slice(-8)}
          </p>
        </div>
      </div>
    )
  }

  // ── SCREEN: Finished ───────────────────────────────────────────────────────
  if (screenState === 'finished') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-md animate-slide-up">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-action)' }}>
            Sesi Selesai!
          </h1>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Gesture: {gesture.label}
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            {config.repetitionCount} repetisi berhasil direkam
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Tunggu instruksi admin untuk sesi berikutnya.
          </p>
        </div>
      </div>
    )
  }

  // ── SCREEN: Main session runner UI ─────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 flex flex-col transition-all duration-500"
      style={{
        background: phaseStyle.bg,
        borderTop: `4px solid ${phaseStyle.border}`,
      }}
    >
      {/* Phase Banner */}
      <div
        className="text-center py-3 transition-all duration-500"
        style={{ background: phaseStyle.border, boxShadow: phaseStyle.glow }}
      >
        <h2 className="text-lg font-bold tracking-widest uppercase animate-pulse-glow" style={{ color: '#fff' }}>
          {phaseStyle.label}
        </h2>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Video Player */}
        <div
          className="w-full max-w-3xl rounded-2xl overflow-hidden transition-all duration-500 relative"
          style={{
            border: `2px solid ${phaseStyle.border}`,
            boxShadow: phaseStyle.glow,
            aspectRatio: '16/9',
            background: '#000',
          }}
        >
          {/* Black overlay for REST phase */}
          <div 
            className="absolute inset-0 z-10 transition-opacity duration-500 pointer-events-none" 
            style={{ 
              background: '#000', 
              opacity: phase === 'REST' ? 1 : 0 
            }} 
          />

          {gesture.videoUrl ? (
            <video
              key={gesture.id}
              ref={videoRef}
              src={gesture.videoUrl}
              className="w-full h-full object-contain"
              loop
              muted
              playsInline
              preload="auto"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <span className="text-6xl mb-3">🤚</span>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{gesture.label}</p>
            </div>
          )}
        </div>

        {/* Info Row */}
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

          {/* Timer */}
          <div className="text-right">
            <p className="text-4xl font-mono font-bold tracking-tight" style={{ color: phaseStyle.text }}>
              {formatTime(timeRemaining)}
            </p>
          </div>
        </div>

        {/* Progress Bars */}
        <div className="w-full max-w-3xl mt-6 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Sisa Waktu Fase</span>
              <span style={{ color: phaseStyle.text }}>{formatTime(timeRemaining)}</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${phaseProgress}%`,
                  background: `linear-gradient(90deg, ${phaseStyle.text}, ${phaseStyle.border})`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Progres Sesi Total</span>
              <span style={{ color: 'var(--color-accent)' }}>{Math.round(totalProgress)}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${totalProgress}%`,
                  background: 'linear-gradient(90deg, var(--color-accent), var(--color-preparation))',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom info bar (no abort button — controlled by admin) */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${phaseStyle.border}` }}>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {session.participantName && `Partisipan: ${session.participantName} · `}
          Sesi: {session.id.slice(-8)}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Dikontrol oleh admin
        </div>
      </div>

      {/* Overlay: Pre-start countdown (3,2,1) - Solid Background */}
      {screenState === 'countdown' && startCountdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
          <div className="text-center">
            <p className="text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
              Bersiap...
            </p>
            <div
              className="text-9xl font-bold animate-countdown"
              key={startCountdown}
              style={{ color: 'var(--color-accent)' }}
            >
              {startCountdown}
            </div>
            <p className="mt-6 text-lg" style={{ color: 'var(--text-secondary)' }}>
              {gesture.label}
            </p>
          </div>
        </div>
      )}

      {/* Overlay: Phase transition countdown (PREP → ACTION) - Solid Background */}
      {phaseCountdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
          <div className="text-center">
            <p
              className="text-sm uppercase tracking-widest mb-4 font-semibold"
              style={{ color: '#10b981' }}
            >
              Fase Aksi Dimulai!
            </p>
            <div
              className="text-9xl font-bold animate-countdown"
              key={`phase-${phaseCountdown}`}
              style={{ color: '#10b981', textShadow: '0 0 60px rgba(16,185,129,0.6)' }}
            >
              {phaseCountdown}
            </div>
            <p className="mt-6 text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
              Tahan Pose — {gesture.label}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
