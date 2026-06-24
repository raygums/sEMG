'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SessionEntryPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = sessionId.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/sessions/${trimmed}`, {
        headers: { 'Cache-Control': 'no-store' },
      })
      if (!res.ok) {
        setError('Session ID tidak ditemukan. Hubungi admin.')
        setLoading(false)
        return
      }
      router.push(`/session/${trimmed}`)
    } catch {
      setError('Gagal terhubung. Periksa koneksi jaringan.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="glass-card p-10 max-w-md w-full text-center animate-fade-in">
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-preparation))' }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Layar Partisipan
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Masukkan Session ID yang diberikan oleh admin untuk bergabung ke sesi akuisisi data EMG.
        </p>

        <form onSubmit={handleJoin} className="space-y-4">
          <div className="text-left">
            <label className="label">Session ID</label>
            <input
              id="session-id-input"
              className="input text-center font-mono text-lg tracking-widest"
              placeholder="Masukkan ID sesi..."
              value={sessionId}
              onChange={e => { setSessionId(e.target.value); setError('') }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm text-left"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
            >
              ⚠ {error}
            </div>
          )}

          <button
            id="btn-join-session"
            type="submit"
            className="btn btn-primary w-full text-base py-3"
            disabled={!sessionId.trim() || loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Menghubungkan...
              </span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Masuk ke Sesi
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
          Session ID tersedia di panel kontrol admin
        </p>
      </div>
    </div>
  )
}
