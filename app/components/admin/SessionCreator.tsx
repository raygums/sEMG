'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Hand } from 'lucide-react'

interface Gesture {
  id: string
  name: string
  label: string
  description: string | null
  videoUrl: string | null
  orderIndex: number
}

interface Config {
  id: string
  name: string
  preparationDuration: number
  actionDuration: number
  restDuration: number
  repetitionCount: number
}

export default function SessionCreator({
  gestures,
  config,
}: {
  gestures: Gesture[]
  config: Config | null
}) {
  const router = useRouter()
  const [selectedGesture, setSelectedGesture] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState('')
  const [participantName, setParticipantName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [dominantHand, setDominantHand] = useState('')
  const [condition, setCondition] = useState('')
  const [loading, setLoading] = useState(false)

  async function createSession() {
    if (!selectedGesture) return
    setLoading(true)

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gestureId: selectedGesture,
          participantId: participantId || undefined,
          participantName: participantName || undefined,
          age: age || undefined,
          gender: gender || undefined,
          dominantHand: dominantHand || undefined,
          condition: condition || undefined,
        }),
      })

      if (!res.ok) throw new Error('Failed to create session')
      const session = await res.json()
      // Admin is redirected to the control panel, NOT the participant screen
      router.push(`/admin/sessions/${session.id}`)
    } catch {
      alert('Gagal membuat sesi. Coba lagi.')
      setLoading(false)
    }
  }

  const selected = gestures.find(g => g.id === selectedGesture)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Buat Sesi Baru</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Isi data partisipan dan pilih gesture, lalu klik &quot;Buat Sesi&quot;
          </p>
        </div>
        <Link href="/admin/sessions" className="btn btn-ghost text-sm">
          ← Kembali ke Riwayat
        </Link>
      </div>

      {/* Config Info */}
      {config && (
        <div className="glass-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Konfigurasi Aktif:</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{config.name}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ({config.preparationDuration}s persiapan / {config.actionDuration}s aksi / {config.restDuration}s istirahat × {config.repetitionCount} repetisi)
            </span>
          </div>
          <Link href="/admin/config" className="text-xs" style={{ color: 'var(--color-accent)' }}>Ubah</Link>
        </div>
      )}

      {/* Participant Metadata Form */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Data Partisipan (Opsional)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">ID Partisipan / Kode</label>
            <input className="input" placeholder="e.g. SUBJ-001" value={participantId} onChange={(e) => setParticipantId(e.target.value)} />
          </div>
          <div>
            <label className="label">Nama / Inisial</label>
            <input className="input" placeholder="e.g. Budi S." value={participantName} onChange={(e) => setParticipantName(e.target.value)} />
          </div>
          <div>
            <label className="label">Umur (Tahun)</label>
            <input type="number" className="input" placeholder="e.g. 24" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Pilih Gender...</option>
              <option value="Male">Laki-laki</option>
              <option value="Female">Perempuan</option>
            </select>
          </div>
          <div>
            <label className="label">Dominan Tangan</label>
            <select className="input" value={dominantHand} onChange={(e) => setDominantHand(e.target.value)}>
              <option value="">Pilih Tangan...</option>
              <option value="Right">Kanan</option>
              <option value="Left">Kiri</option>
              <option value="Ambidextrous">Keduanya (Ambidextrous)</option>
            </select>
          </div>
          <div>
            <label className="label">Kondisi / Catatan Klinis</label>
            <input className="input" placeholder="e.g. Sehat, Myalgia" value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Gesture Selection */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          Pilih Gesture
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {gestures.map((g) => (
            <button
              key={g.id}
              className="glass-card p-4 text-left transition-all duration-200"
              onClick={() => setSelectedGesture(g.id)}
              style={{
                borderColor: selectedGesture === g.id ? 'var(--color-accent)' : undefined,
                boxShadow: selectedGesture === g.id ? '0 0 20px rgba(20, 184, 166, 0.2)' : undefined,
              }}
            >
              {g.videoUrl ? (
                <div className="rounded-lg overflow-hidden mb-2" style={{ aspectRatio: '16/10', background: '#000' }}>
                  <video src={g.videoUrl} className="w-full h-full object-cover" preload="metadata" muted />
                </div>
              ) : (
                <div className="rounded-lg mb-2 flex items-center justify-center text-gray-500" style={{ aspectRatio: '16/10', background: 'var(--bg-primary)' }}>
                  <Hand strokeWidth={1.5} className="w-8 h-8 opacity-70" />
                </div>
              )}
              <p className="text-sm font-medium" style={{ color: selectedGesture === g.id ? 'var(--color-accent)' : 'var(--text-primary)' }}>
                {g.label}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{g.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Selected & Create */}
      {selected && (
        <div className="sticky bottom-6 z-20 mt-8 animate-slide-up">
          <div className="glass-card p-5 glow-action flex items-center justify-between" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Gesture terpilih</p>
              <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-accent)' }}>{selected.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Setelah dibuat, Anda akan diarahkan ke Panel Kontrol
              </p>
            </div>
            <button className="btn btn-primary text-base px-8 py-3" onClick={createSession} disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Membuat Sesi...
                </span>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                  Buat Sesi
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
