'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Wifi,
  WifiOff,
  Monitor,
  Copy,
  Check,
} from 'lucide-react'
import type { SessionStatus } from '@/app/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionControllerProps {
  /** The session ID to control. */
  sessionId: string
  /** Display-only metadata passed from the parent server component. */
  gestureName: string
  gestureLabel: string
  participantName: string | null
  config: {
    preparationDuration: number
    actionDuration: number
    restDuration: number
    repetitionCount: number
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<
  SessionStatus,
  { label: string; badgeClass: string; Icon: React.ElementType }
> = {
  pending:   { label: 'Menunggu',   badgeClass: 'badge badge-warning', Icon: Clock },
  running:   { label: 'Berjalan',   badgeClass: 'badge badge-success', Icon: RefreshCw },
  completed: { label: 'Selesai',    badgeClass: 'badge badge-info',    Icon: CheckCircle2 },
  aborted:   { label: 'Dihentikan', badgeClass: 'badge badge-danger',  Icon: XCircle },
}

const POLL_INTERVAL_MS = 1_500

// ─────────────────────────────────────────────────────────────────────────────
// SessionController — Admin / Researcher View
// ─────────────────────────────────────────────────────────────────────────────

export default function SessionController({
  sessionId,
  gestureName,
  gestureLabel,
  participantName,
  config,
}: SessionControllerProps) {
  const [status, setStatus]             = useState<SessionStatus>('pending')
  const [loading, setLoading]           = useState<'start' | 'abort' | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [pollOk, setPollOk]             = useState(true)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [copied, setCopied]             = useState(false)
  const confirmTimerRef                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  const participantUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/session/${sessionId}`
    : `/session/${sessionId}`

  // ── Poll current status ────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) { setPollOk(false); return }
      const data = await res.json() as { status: SessionStatus }
      setStatus(data.status)
      setPollOk(true)
    } catch {
      setPollOk(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchStatus])

  // ── PATCH helper ──────────────────────────────────────────────────────────

  async function patchStatus(next: SessionStatus, actionKey: 'start' | 'abort') {
    setLoading(actionKey)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { status: SessionStatus }
      setStatus(data.status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(null)
    }
  }

  // ── Start handler ─────────────────────────────────────────────────────────

  function handleStart() {
    patchStatus('running', 'start')
  }

  // ── Abort handler (requires double-confirm) ───────────────────────────────

  function handleAbortClick() {
    if (!confirmAbort) {
      setConfirmAbort(true)
      confirmTimerRef.current = setTimeout(() => setConfirmAbort(false), 4_000)
      return
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    setConfirmAbort(false)
    patchStatus('aborted', 'abort')
  }

  // ── Copy session ID ───────────────────────────────────────────────────────

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(participantUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  // ── Open participant screen ───────────────────────────────────────────────

  function openParticipantScreen() {
    window.open(`/session/${sessionId}`, '_blank', 'noopener,noreferrer')
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const meta         = STATUS_META[status]
  const canStart     = status === 'pending'
  const canAbort     = status === 'running'
  const isTerminal   = status === 'completed' || status === 'aborted'
  const totalSeconds =
    (config.preparationDuration + config.actionDuration + config.restDuration) *
    config.repetitionCount

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="glass-card p-6 max-w-xl w-full animate-fade-in space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Panel Kontrol Peneliti
          </p>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {gestureLabel}
          </h2>
          {participantName && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Partisipan: <span style={{ color: 'var(--color-accent)' }}>{participantName}</span>
            </p>
          )}
        </div>

        {/* Status badge */}
        <div className="flex flex-col items-end gap-1">
          <span className={meta.badgeClass}>
            <meta.Icon className="w-3 h-3 mr-1" />
            {meta.label}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: pollOk ? 'var(--text-muted)' : 'var(--color-danger)' }}>
            {pollOk ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {pollOk ? 'Terhubung' : 'Gagal terhubung'}
          </span>
        </div>
      </div>

      {/* ── Participant screen link ────────────────────────────────────────── */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Layar Partisipan
        </p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 text-xs font-mono px-3 py-2 rounded-lg truncate"
            style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--color-accent)' }}
          >
            /session/{sessionId}
          </code>
          <button
            className="btn btn-ghost text-xs px-2 py-1.5 shrink-0"
            onClick={handleCopyUrl}
            title="Salin URL"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            className="btn btn-ghost text-xs px-2 py-1.5 shrink-0 flex items-center gap-1"
            onClick={openParticipantScreen}
            title="Buka layar partisipan di tab baru"
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline">Buka</span>
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Buka URL di atas di perangkat/layar partisipan, lalu masukkan Session ID atau gunakan tautan langsung.
        </p>
        {/* Session ID for easy copy */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Session ID:</span>
          <span
            className="font-mono text-xs px-2 py-1 rounded select-all"
            style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)' }}
          >
            {sessionId}
          </span>
        </div>
      </div>

      {/* ── Config summary ────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-4 gap-2 rounded-xl p-4"
        style={{ background: 'var(--bg-primary)' }}
      >
        {[
          { label: 'Persiapan', value: `${config.preparationDuration}s`, color: 'var(--color-preparation)' },
          { label: 'Aksi',      value: `${config.actionDuration}s`,      color: 'var(--color-action)' },
          { label: 'Istirahat', value: `${config.restDuration}s`,        color: 'var(--color-rest)' },
          { label: 'Repetisi',  value: `${config.repetitionCount}×`,     color: 'var(--color-accent)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-lg font-bold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Estimated total time ──────────────────────────────────────────── */}
      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        Estimasi durasi:{' '}
        <span style={{ color: 'var(--text-secondary)' }}>
          ~{Math.ceil(totalSeconds / 60)} menit ({totalSeconds}s)
        </span>
        {' · '}
        Gesture:{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{gestureName}</span>
      </p>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Control buttons ───────────────────────────────────────────────── */}
      {isTerminal ? (
        <div
          className="flex items-center justify-center gap-2 rounded-xl py-4 text-sm"
          style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}
        >
          <meta.Icon className="w-4 h-4" />
          Sesi telah {meta.label.toLowerCase()}. Tidak ada aksi lebih lanjut.
        </div>
      ) : (
        <div className="flex gap-3">
          {/* Start */}
          <button
            id="btn-start-session"
            className="btn btn-primary flex-1 text-base py-3"
            onClick={handleStart}
            disabled={!canStart || loading !== null}
            aria-label="Mulai sesi akuisisi data"
          >
            {loading === 'start' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {loading === 'start' ? 'Memulai...' : 'Mulai Sesi'}
          </button>

          {/* Abort */}
          <button
            id="btn-abort-session"
            className="btn flex-1 text-base py-3 transition-all duration-200"
            onClick={handleAbortClick}
            disabled={!canAbort || loading !== null}
            aria-label={confirmAbort ? 'Konfirmasi hentikan sesi' : 'Hentikan sesi'}
            style={
              confirmAbort
                ? { background: 'rgba(239,68,68,0.25)', color: '#ef4444', borderColor: '#ef4444' }
                : { background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }
            }
          >
            {loading === 'abort' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {loading === 'abort'
              ? 'Menghentikan...'
              : confirmAbort
              ? '⚠ Konfirmasi Hentikan'
              : 'Hentikan Sesi'}
          </button>
        </div>
      )}

      {/* Abort confirmation hint */}
      {confirmAbort && (
        <p className="text-xs text-center animate-fade-in" style={{ color: '#f59e0b' }}>
          Klik &quot;Konfirmasi Hentikan&quot; sekali lagi untuk menghentikan sesi. Batalkan otomatis dalam 4 detik.
        </p>
      )}

      {/* Status note for running */}
      {status === 'running' && (
        <div
          className="rounded-xl px-4 py-3 text-sm text-center"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}
        >
          ● Sesi sedang berjalan — layar partisipan memperbarui secara otomatis
        </div>
      )}
    </div>
  )
}
