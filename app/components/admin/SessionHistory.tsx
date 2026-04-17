'use client'

interface SessionRow {
  id: string
  participantName: string | null
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
  function downloadExport(sessionId: string, format: 'csv' | 'json') {
    window.open(`/api/sessions/${sessionId}/events?format=${format}`, '_blank')
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
          <div className="text-4xl mb-3">📊</div>
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
                <th>Export</th>
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
                      {s.eventCount > 0 && (
                        <div className="flex gap-1">
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
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
