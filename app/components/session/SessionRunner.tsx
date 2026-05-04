'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Hand } from 'lucide-react'
import { audioCue } from '@/app/lib/audioCue'
import type { PhaseType, SessionEvent } from '@/app/lib/types'

interface SessionData {
  id: string
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

export default function SessionRunner({ session }: { session: SessionData }) {
  const router = useRouter()
  const { config, gesture } = session

  const [phase, setPhase] = useState<PhaseType>('PREPARATION')
  const [repetition, setRepetition] = useState(1)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const eventsRef = useRef<SessionEvent[]>([])
  const startTimeRef = useRef<number>(0)
  const phaseStartRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerDisplayRef = useRef<HTMLDivElement>(null)
  const timeRemainingRef = useRef<number>(config.preparationDuration)
  const phaseRef = useRef<PhaseType>('PREPARATION')
  const repetitionRef = useRef<number>(1)
  const workerRef = useRef<Worker | null>(null)
  const audioInitializedRef = useRef(false)

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
      clientTimestamp: performance.now(), // Use performance.now() which matches Float type
      metadata: {
        gestureName: gesture.name,
        gestureLabel: gesture.label,
        sessionId: session.id,
        ...meta,
      },
    }
    eventsRef.current.push(event)

    // Send trigger for ACTION phase
    if (eventType === 'PHASE_ACTION') {
      // NOTE: Trigger Synchronization Architecture (Sprint 1 MVP)
      // Current implementation uses HTTP fetch for trigger signals. This has ~50-200ms latency
      // due to browser queue and network overhead, which is acceptable for recording setup.
      //
      // FOR PRODUCTION (Sprint 2+):
      // - Replace with WebSockets (persistent connection, <10ms latency)
      // - OR use Web Serial API for direct device connection (eliminates network latency)
      // - Maintain this HTTP endpoint as fallback for development/testing
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
      }).catch(() => {}) // Fire and forget
    }
  }, [gesture, session.id])

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
      // Re-add events on failure
      eventsRef.current = [...events, ...eventsRef.current]
    }
  }, [session.id])

  // Transition to next phase
  const nextPhase = useCallback((currentPhase: PhaseType, currentRep: number) => {
    if (currentPhase === 'PREPARATION') {
      phaseRef.current = 'ACTION'
      setPhase('ACTION')
      phaseStartRef.current = performance.now()
      const phaseEndTime = phaseStartRef.current + config.actionDuration * 1000
      scheduleAudioCue(phaseEndTime)
      logEvent('PHASE_ACTION', currentRep, { phaseDuration: config.actionDuration })
    } else if (currentPhase === 'ACTION') {
      phaseRef.current = 'REST'
      setPhase('REST')
      if (videoRef.current) {
        videoRef.current.pause()
      }
      phaseStartRef.current = performance.now()
      const phaseEndTime = phaseStartRef.current + config.restDuration * 1000
      scheduleAudioCue(phaseEndTime)
      logEvent('PHASE_REST', currentRep, { phaseDuration: config.restDuration })
      logEvent('REPETITION_END', currentRep)
    } else if (currentPhase === 'REST') {
      if (currentRep >= config.repetitionCount) {
        // Session complete
        logEvent('SESSION_END', currentRep)
        setIsFinished(true)
        setIsRunning(false)

        // Update session status
        fetch(`/api/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        })

        // Flush remaining events
        flushEvents()
        return
      }

      // Next repetition
      const nextRep = currentRep + 1
      repetitionRef.current = nextRep
      setRepetition(nextRep)
      phaseRef.current = 'PREPARATION'
      setPhase('PREPARATION')
      phaseStartRef.current = performance.now()
      const phaseEndTime = phaseStartRef.current + config.preparationDuration * 1000
      scheduleAudioCue(phaseEndTime)
      logEvent('REPETITION_START', nextRep)
      logEvent('PHASE_PREPARATION', nextRep, { phaseDuration: config.preparationDuration })

      // Restart video
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }
    }
  }, [config, logEvent, flushEvents, session.id])

  // Main timer loop with Web Worker (NO setTimeRemaining to avoid re-render hell)
  useEffect(() => {
    if (!isRunning || isFinished) {
      if (workerRef.current) {
        workerRef.current.postMessage('stop')
        workerRef.current.terminate()
        workerRef.current = null
      }
      return
    }

    // Create Web Worker for timing
    const workerCode = `
      let timerId = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          timerId = setInterval(() => self.postMessage('tick'), 16);
        } else if (e.data === 'stop') {
          clearInterval(timerId);
        }
      };
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    workerRef.current = worker

    worker.onmessage = () => {
      const elapsed = (performance.now() - phaseStartRef.current) / 1000
      const duration = getPhaseDuration(phaseRef.current)
      const remaining = Math.max(0, duration - elapsed)

      // Update display directly without React re-render
      updateTimerDisplay(remaining)

      if (remaining <= 0) {
        nextPhase(phaseRef.current, repetitionRef.current)
      }
    }

    worker.postMessage('start')

    return () => {
      if (worker) {
        worker.postMessage('stop')
        worker.terminate()
        workerRef.current = null
      }
    }
  }, [isRunning, isFinished, getPhaseDuration, nextPhase])

  // Periodic flush events
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(flushEvents, 5000)
    return () => clearInterval(interval)
  }, [isRunning, flushEvents])

  // Pre-start countdown with fullscreen and audio init
  function startCountdown() {
    setCountdown(3)

    // Initialize audio context (required for autoplay policy)
    audioCue.initializeAudioContext()
    audioInitializedRef.current = true

    // Request fullscreen
    try {
      const elem = document.documentElement
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {
          console.warn('Fullscreen request failed')
        })
      }
    } catch (error) {
      console.warn('Fullscreen not available:', error)
    }

    // Update session status to running
    fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'running' }),
    })
  }

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      setIsRunning(true)
      startTimeRef.current = performance.now()
      phaseStartRef.current = performance.now()
      phaseRef.current = 'PREPARATION'
      repetitionRef.current = 1

      // Initialize display
      updateTimerDisplay(config.preparationDuration)

      logEvent('SESSION_START', 1)
      logEvent('REPETITION_START', 1)
      logEvent('PHASE_PREPARATION', 1, { phaseDuration: config.preparationDuration })

      // Note: Video play is handled by autoPlay attribute when the main UI mounts
      return
    }

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, config.preparationDuration, logEvent])

  // Abort session
  function abortSession() {
    if (!confirm('Yakin ingin menghentikan sesi?')) return
    cancelAnimationFrame(rafRef.current)
    setIsRunning(false)
    logEvent('SESSION_ABORT', repetition)

    fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'aborted' }),
    })

    flushEvents()
    router.push('/session')
  }

  // Progress calculations
  const phaseDuration = getPhaseDuration(phase)
  const phaseProgress = phaseDuration > 0 ? ((phaseDuration - timeRemainingRef.current) / phaseDuration) * 100 : 0

  const totalPhases = config.repetitionCount * 3
  const completedPhases = (repetition - 1) * 3 +
    (phase === 'PREPARATION' ? 0 : phase === 'ACTION' ? 1 : 2)
  const totalProgress = (completedPhases / totalPhases) * 100

  const phaseStyle = PHASE_COLORS[phase]

  // Format time with milliseconds
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
  }

  // Update timer display directly (no React re-render)
  function updateTimerDisplay(remaining: number) {
    if (timerDisplayRef.current) {
      timerDisplayRef.current.textContent = formatTime(remaining)
    }
    timeRemainingRef.current = remaining
  }

  // Play audio cue 1 second before phase transition
  function scheduleAudioCue(phaseEndTime: number) {
    const now = performance.now()
    const timeUntilEnd = (phaseEndTime - now) / 1000
    
    if (timeUntilEnd > 1) {
      // Schedule audio cue 1 second before end
      setTimeout(() => {
        if (audioInitializedRef.current) {
          audioCue.playDoubleBip()
        }
      }, (timeUntilEnd - 1) * 1000)
    }
  }

  // Pre-start overlay
  if (countdown !== null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
            Bersiap...
          </p>
          <div
            className="text-9xl font-bold animate-countdown"
            key={countdown}
            style={{ color: 'var(--color-accent)' }}
          >
            {countdown}
          </div>
          <p className="mt-6 text-lg" style={{ color: 'var(--text-secondary)' }}>
            {gesture.label}
          </p>
        </div>
      </div>
    )
  }

  // Finished overlay
  if (isFinished) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-md animate-slide-up">
          <div className="mb-4 flex flex-col items-center justify-center text-emerald-400">
            <CheckCircle2 strokeWidth={1.5} className="w-20 h-20 shadow-emerald-500/20 drop-shadow-xl" />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-action)' }}>
            Sesi Selesai!
          </h1>
          <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Gesture: {gesture.label}
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            {config.repetitionCount} repetisi berhasil direkam
          </p>
          <div className="flex gap-3 justify-center">
            <button className="btn btn-primary" onClick={() => router.push('/session')}>
              Sesi Baru
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/admin/sessions')}>
              Lihat Riwayat
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Not started yet
  if (!isRunning) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-lg animate-fade-in">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-preparation))' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Sesi Akuisisi Data
          </h1>
          <p className="text-lg mb-1" style={{ color: 'var(--color-accent)' }}>
            {gesture.label}
          </p>
          {session.participantName && (
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Partisipan: {session.participantName}
            </p>
          )}
          <div className="grid grid-cols-4 gap-3 mb-8">
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Persiapan</p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-preparation)' }}>{config.preparationDuration}s</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aksi</p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-action)' }}>{config.actionDuration}s</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Istirahat</p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-rest)' }}>{config.restDuration}s</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Repetisi</p>
              <p className="text-lg font-bold" style={{ color: 'var(--color-accent)' }}>{config.repetitionCount}×</p>
            </div>
          </div>
          <button className="btn btn-primary text-lg px-10 py-3.5" onClick={startCountdown}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            Mulai
          </button>
          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Pastikan sensor EMG sudah siap sebelum memulai
          </p>
        </div>
      </div>
    )
  }

  // Main Session Runner UI
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
        style={{
          background: phaseStyle.border,
          boxShadow: phaseStyle.glow,
        }}
      >
        <h2
          className="text-lg font-bold tracking-widest uppercase animate-pulse-glow"
          style={{ color: '#fff' }}
        >
          {phaseStyle.label}
        </h2>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Video Player */}
        <div
          className="w-full max-w-3xl rounded-2xl overflow-hidden transition-all duration-500"
          style={{
            border: `2px solid ${phaseStyle.border}`,
            boxShadow: phaseStyle.glow,
            aspectRatio: '16/9',
            background: '#000',
          }}
        >
          {gesture.videoUrl ? (
            <video
              ref={videoRef}
              src={gesture.videoUrl}
              className={`w-full h-full object-contain transition-all duration-700 ease-in-out
                ${phase === 'REST' ? 'opacity-0 scale-95' : 'opacity-100'} 
                ${phase === 'ACTION' ? 'scale-[1.03] brightness-110' : 'scale-100 brightness-75'}
              `}
              loop
              muted
              playsInline
              preload="auto"
              autoPlay
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <span className="mb-3 flex items-center justify-center">
                <Hand strokeWidth={1.5} className="w-16 h-16 text-gray-500" />
              </span>
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
            <p 
              ref={timerDisplayRef}
              className="text-4xl font-mono font-bold tracking-tight" 
              style={{ color: phaseStyle.text }}
            >
              {formatTime(timeRemainingRef.current)}
            </p>
          </div>
        </div>

        {/* Progress Bars */}
        <div className="w-full max-w-3xl mt-6 space-y-3">
          {/* Phase Progress */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>Sisa Waktu Fase</span>
              <span style={{ color: phaseStyle.text }}>{formatTime(timeRemainingRef.current)}</span>
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

          {/* Total Progress */}
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

      {/* Bottom Bar */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${phaseStyle.border}` }}>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {session.participantName && `Partisipan: ${session.participantName} · `}
          Sesi: {session.id.slice(-8)}
        </div>
        <button className="btn btn-danger text-sm" onClick={abortSession}>
          ■ Hentikan Sesi
        </button>
      </div>
    </div>
  )
}
