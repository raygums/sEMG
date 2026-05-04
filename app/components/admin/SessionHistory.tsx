'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Trash2, Loader2, Pencil, X } from 'lucide-react'

interface SessionRow {
  id: string
  participantId: string | null
  participantName: string | null
  age: number | null
  gender: string | null
  dominantHand: string | null
  condition: string | null
  status: string
  gestureName: string
  gestureLabel: string
  configName: string
  eventCount: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export default function SessionHistory({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  // Edit state
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  function downloadExport(sessionId: string, format: 'csv' | 'json') {
    window.open(`/api/sessions/${sessionId}/events?format=${format}`, '_blank')
  }

  async function handleDelete(sessionId: string) {
    if (!confirm('Yakin ingin menghapus sesi ini beserta semua event log-nya? Tindakan ini tidak dapat dibatalkan.')) return
    
    setDeletingId(sessionId)
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      alert('Gagal menghapus sesi.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingSession) return
    setEditLoading(true)
    
    const formData = new FormData(e.currentTarget)
    const payload = {
      participantId: formData.get('participantId') || null,
      participantName: formData.get('participantName') || null,
      age: formData.get('age') ? parseInt(formData.get('age') as string) : null,
      gender: formData.get('gender') || null,
      dominantHand: formData.get('dominantHand') || null,
      condition: formData.get('condition') || null,
    }

    try {
      const res = await fetch(`/api/sessions/${editingSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Gagal update biodata')
      setEditingSession(null)
      router.refresh()
    } catch {
      alert('Gagal mengedit biodata.')
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Riwayat Sesi</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Lihat semua sesi eksperimen dan export event log
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="mb-3 flex items-center justify-center text-gray-400"><BarChart3 strokeWidth={1.5} className="w-12 h-12" /></div>
          <p style={{ color: 'var(--text-secondary)' }}>Belum ada sesi yang terekam.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Gesture</th>
                <th>Partisipan</th>
                <th>Konfigurasi</th>
                <th>Status</th>
                <th>Events</th>
                <th>Durasi</th>
                <th>Waktu</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const duration = s.startedAt && s.completedAt
                  ? Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
                  : null

                return (
                  <tr key={s.id}>
                    <td>
                      <div>
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{s.gestureLabel}</span>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.gestureName}</p>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.participantName || '-'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.configName}</td>
                    <td>
                      <span className={`badge ${
                        s.status === 'completed' ? 'badge-success' :
                        s.status === 'running' ? 'badge-info' :
                        s.status === 'aborted' ? 'badge-danger' : 'badge-neutral'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.eventCount}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {duration ? `${duration}s` : '-'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      {new Date(s.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {s.eventCount > 0 && (
                          <>
                            <button
                              className="btn btn-ghost text-xs py-1 px-2"
                              onClick={() => downloadExport(s.id, 'csv')}
                              title="Export CSV"
                            >
                              CSV
                            </button>
                            <button
                              className="btn btn-ghost text-xs py-1 px-2"
                              onClick={() => downloadExport(s.id, 'json')}
                              title="Export JSON"
                            >
                              JSON
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-ghost text-teal-500 hover:text-teal-400 hover:bg-teal-500/10 p-1.5 ml-2"
                          onClick={() => setEditingSession(s)}
                          title="Edit Biodata"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn btn-ghost text-red-500 hover:text-red-400 hover:bg-red-500/10 p-1.5"
                          onClick={() => handleDelete(s.id)}
                          disabled={deletingId === s.id}
                          title="Hapus Sesi"
                        >
                          {deletingId === s.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="glass-card w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Edit Biodata Partisipan</h3>
              <button className="text-gray-400 hover:text-white transition-colors" onClick={() => setEditingSession(null)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">ID Partisipan / Kode</label>
                  <input name="participantId" className="input" defaultValue={editingSession.participantId || ''} />
                </div>
                <div>
                  <label className="label">Nama / Inisial</label>
                  <input name="participantName" className="input" defaultValue={editingSession.participantName || ''} />
                </div>
                <div>
                  <label className="label">Umur (Tahun)</label>
                  <input type="number" name="age" className="input" defaultValue={editingSession.age || ''} />
                </div>
                <div>
                  <label className="label">Gender</label>
                  <select name="gender" className="input" defaultValue={editingSession.gender || ''}>
                    <option value="">Pilih Gender...</option>
                    <option value="Male">Laki-laki</option>
                    <option value="Female">Perempuan</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Dominan Tangan</label>
                  <select name="dominantHand" className="input" defaultValue={editingSession.dominantHand || ''}>
                    <option value="">Pilih Tangan...</option>
                    <option value="Right">Kanan</option>
                    <option value="Left">Kiri</option>
                    <option value="Ambidextrous">Keduanya (Ambidextrous)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Kondisi / Catatan Klinis</label>
                  <input name="condition" className="input" defaultValue={editingSession.condition || ''} />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 mt-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingSession(null)}>Batal</button>
                <button type="submit" className="btn btn-primary min-w-[100px]" disabled={editLoading}>
                  {editLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
