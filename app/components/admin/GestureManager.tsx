'use client'

import { useState, useRef } from 'react'
import { createGesture, updateGesture, deleteGesture } from '@/app/lib/actions'

interface Gesture {
  id: string
  name: string
  label: string
  description: string | null
  videoUrl: string | null
  orderIndex: number
}

export default function GestureManager({ gestures: initialGestures }: { gestures: Gesture[] }) {
  const [gestures, setGestures] = useState(initialGestures)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Gesture | null>(null)
  const [uploading, setUploading] = useState(false)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File): Promise<string | null> {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('video', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      return data.url
    } catch {
      alert('Upload gagal. Coba lagi.')
      return null
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(formData: FormData) {
    // Handle video upload first
    const videoFile = fileInputRef.current?.files?.[0]
    if (videoFile) {
      const url = await handleUpload(videoFile)
      if (url) formData.set('videoUrl', url)
    } else if (editing?.videoUrl) {
      formData.set('videoUrl', editing.videoUrl)
    }

    if (editing) {
      await updateGesture(editing.id, formData)
    } else {
      await createGesture(formData)
    }

    // Refresh data
    const res = await fetch('/api/gestures')
    const updated = await res.json()
    setGestures(updated)
    setShowForm(false)
    setEditing(null)
    setVideoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus gesture ini?')) return
    await deleteGesture(id)
    const res = await fetch('/api/gestures')
    const updated = await res.json()
    setGestures(updated)
  }

  function openEdit(gesture: Gesture) {
    setEditing(gesture)
    setVideoPreview(gesture.videoUrl)
    setShowForm(true)
  }

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setVideoPreview(URL.createObjectURL(file))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Manajemen Gesture</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Kelola 12 jenis gerakan jari dan video tutorial
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setEditing(null); setVideoPreview(null) }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Tambah Gesture
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-card p-6 w-full max-w-lg animate-slide-up" style={{ background: 'var(--bg-surface)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              {editing ? 'Edit Gesture' : 'Tambah Gesture'}
            </h2>
            <form action={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nama Gesture</label>
                <input name="name" className="input" required placeholder="e.g. Thumb Extension" defaultValue={editing?.name || ''} />
              </div>
              <div>
                <label className="label">Label (Singkat)</label>
                <input name="label" className="input" required placeholder="e.g. Jempol Ekstensi" defaultValue={editing?.label || ''} />
              </div>
              <div>
                <label className="label">Deskripsi</label>
                <textarea name="description" className="input" rows={2} placeholder="Deskripsi opsional..." defaultValue={editing?.description || ''} style={{ resize: 'vertical' }} />
              </div>
              <div>
                <label className="label">Urutan</label>
                <input name="orderIndex" type="number" className="input" defaultValue={editing?.orderIndex ?? gestures.length} />
              </div>
              <div>
                <label className="label">Video Tutorial</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg"
                  onChange={handleVideoChange}
                  className="input"
                  style={{ padding: '8px' }}
                />
                {videoPreview && (
                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                    <video src={videoPreview} controls className="w-full" style={{ maxHeight: '200px' }} />
                  </div>
                )}
              </div>
              <input type="hidden" name="videoUrl" defaultValue={editing?.videoUrl || ''} />

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn btn-primary flex-1" disabled={uploading}>
                  {uploading ? 'Mengupload...' : editing ? 'Simpan' : 'Tambah'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gesture Grid */}
      {gestures.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">🤚</div>
          <p style={{ color: 'var(--text-secondary)' }}>Belum ada gesture. Tambah gesture pertama Anda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {gestures.map((g, idx) => (
            <div key={g.id} className="glass-card overflow-hidden animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
              {/* Video Preview */}
              {g.videoUrl ? (
                <div className="relative" style={{ background: '#000', aspectRatio: '16/9' }}>
                  <video src={g.videoUrl} className="w-full h-full object-cover" preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center" style={{ background: 'var(--bg-primary)', aspectRatio: '16/9' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Belum ada video</span>
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{g.label}</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{g.name}</p>
                  </div>
                  <span className="badge badge-info text-xs">#{g.orderIndex}</span>
                </div>
                {g.description && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{g.description}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-secondary text-xs py-1.5 px-3 flex-1" onClick={() => openEdit(g)}>Edit</button>
                  <button className="btn btn-danger text-xs py-1.5 px-3" onClick={() => handleDelete(g.id)}>Hapus</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
