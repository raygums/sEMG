'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  const [timeRemaining, setTimeRemaining] = useState(config.preparationDuration)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null) // Pre-start countdown
  const [gatewayConnected, setGatewayConnected] = useState(true) // BLE gateway connectivity (polled)
  const isPausedRef = useRef(false) // mirrors !gatewayConnected, read inside the RAF loop without re-subscribing it

  const eventsRef = useRef<SessionEvent[]>([])
  const startTimeRef = useRef<number>(0)
  const phaseStartRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement>(null)

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

    // Send trigger for events the gateway needs to react to in real time:
    // PHASE_ACTION (legacy use), and now SESSION_START/SESSION_END/SESSION_ABORT
    // so the Python gateway can gate is_recording for Continuous Recording mode.
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
      setPhase('ACTION')
      setTimeRemaining(config.actionDuration)
      phaseStartRef.current = performance.now()
      logEvent('PHASE_ACTION', currentRep, { phaseDuration: config.actionDuration })
    } else if (currentPhase === 'ACTION') {
      setPhase('REST')
      setTimeRemaining(config.restDuration)
      phaseStartRef.current = performance.now()
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
      setRepetition(nextRep)
      setPhase('PREPARATION')
      setTimeRemaining(config.preparationDuration)
      phaseStartRef.current = performance.now()
      logEvent('REPETITION_START', nextRep)
      logEvent('PHASE_PREPARATION', nextRep, { phaseDuration: config.preparationDuration })

      // Restart video
      if (videoRef.current) {
        videoRef.current.currentTime = 0
        videoRef.current.play().catch(() => {})
      }
    }
  }, [config, logEvent, flushEvents, session.id])

  // Main timer loop with requestAnimationFrame
  useEffect(() => {
    if (!isRunning || isFinished) return

    let lastPhase = phase
    let lastRep = repetition
    let lastFrameTime = performance.now()

    const tick = () => {
      const now = performance.now()
      const frameDelta = now - lastFrameTime
      lastFrameTime = now

      if (isPausedRef.current) {
        // Freeze the timeline: push phaseStartRef forward by the same delta
        // so "elapsed" doesn't grow while the BLE gateway is disconnected.
        // No event is logged here - PHASE_* events only fire on real transitions.
        phaseStartRef.current += frameDelta
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const elapsed = (now - phaseStartRef.current) / 1000
      const duration = getPhaseDuration(lastPhase)
      const remaining = Math.max(0, duration - elapsed)

      setTimeRemaining(remaining)

      if (remaining <= 0) {
        nextPhase(lastPhase, lastRep)

        // Update local tracking
        if (lastPhase === 'PREPARATION') lastPhase = 'ACTION'
        else if (lastPhase === 'ACTION') lastPhase = 'REST'
        else if (lastPhase === 'REST') {
          if (lastRep >= config.repetitionCount) return
          lastPhase = 'PREPARATION'
          lastRep += 1
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [isRunning, isFinished, phase, repetition, getPhaseDuration, nextPhase, config.repetitionCount])

  // Periodic flush events
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(flushEvents, 5000)
    return () => clearInterval(interval)
  }, [isRunning, flushEvents])

  // Poll gateway connectivity status while the session is running, so the
  // phase timeline can pause if the BLE link to the nRF52840 drops.
  useEffect(() => {
    if (!isRunning || isFinished) return

    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}/gateway-status`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        setGatewayConnected(data.connected)
        isPausedRef.current = !data.connected
      } catch {
        // Network hiccup on the polling request itself - don't pause on this
        // alone, since it doesn't necessarily mean the BLE link is down.
      }
    }

    poll()
    const interval = setInterval(poll, 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isRunning, isFinished, session.id])

  // Pre-start countdown
  function startCountdown() {
    setCountdown(3)

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

      logEvent('SESSION_START', 1)
      logEvent('REPETITION_START', 1)
      logEvent('PHASE_PREPARATION', 1, { phaseDuration: config.preparationDuration })

      // Start video
      if (videoRef.current) {
        videoRef.current.play().catch(() => {})
      }
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
  const phaseProgress = phaseDuration > 0 ? ((phaseDuration - timeRemaining) / phaseDuration) * 100 : 0

  const totalPhases = config.repetitionCount * 3
  const completedPhases = (repetition - 1) * 3 +
    (phase === 'PREPARATION' ? 0 : phase === 'ACTION' ? 1 : 2)
  const totalProgress = (completedPhases / totalPhases) * 100

  const phaseStyle = PHASE_COLORS[phase]

  // Format time
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
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
      {/* Gateway connectivity warning - timeline is paused while this is visible */}
      {!gatewayConnected && (
        <div
          className="text-center py-2 animate-pulse-glow"
          style={{ background: '#dc2626' }}
        >
          <p className="text-sm font-bold tracking-wide uppercase" style={{ color: '#fff' }}>
            ⚠️ Sensor BLE terputus — linimasa dijeda, menunggu koneksi kembali...
          </p>
        </div>
      )}

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
          {/* Phase Progress */}
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
