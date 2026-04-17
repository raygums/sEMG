import { prisma } from '@/app/lib/prisma'
import { ensureAdmin } from '@/app/lib/auth'
import Link from 'next/link'

export default async function AdminDashboard() {
  await ensureAdmin()

  // Ensure default config exists
  const configCount = await prisma.sessionConfig.count()
  if (configCount === 0) {
    await prisma.sessionConfig.create({
      data: {
        name: 'Default',
        preparationDuration: 3,
        actionDuration: 5,
        restDuration: 3,
        repetitionCount: 10,
        isActive: true,
      },
    })
  }

  const [gestureCount, sessionCount, completedCount, activeConfig] = await Promise.all([
    prisma.gesture.count(),
    prisma.session.count(),
    prisma.session.count({ where: { status: 'completed' } }),
    prisma.sessionConfig.findFirst({ where: { isActive: true } }),
  ])

  const recentSessions = await prisma.session.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { gesture: true, _count: { select: { events: true } } },
  })

  const stats = [
    {
      label: 'Total Gesture',
      value: gestureCount,
      icon: '🤚',
      color: 'var(--color-preparation)',
      href: '/admin/gestures',
    },
    {
      label: 'Total Sesi',
      value: sessionCount,
      icon: '📊',
      color: 'var(--color-accent)',
      href: '/admin/sessions',
    },
    {
      label: 'Sesi Selesai',
      value: completedCount,
      icon: '✅',
      color: 'var(--color-action)',
      href: '/admin/sessions',
    },
    {
      label: 'Repetisi/Gesture',
      value: activeConfig?.repetitionCount ?? 10,
      icon: '🔄',
      color: 'var(--color-rest)',
      href: '/admin/config',
    },
  ]

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Overview sistem akuisisi data EMG
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="glass-card p-5 block">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {stat.label}
                </p>
                <p className="mt-2 text-3xl font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </div>
              <span className="text-2xl">{stat.icon}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Active Config */}
      {activeConfig && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Konfigurasi Aktif
            </h2>
            <Link href="/admin/config" className="text-sm" style={{ color: 'var(--color-accent)' }}>
              Ubah →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Persiapan', value: `${activeConfig.preparationDuration}s`, color: 'var(--color-preparation)' },
              { label: 'Aksi', value: `${activeConfig.actionDuration}s`, color: 'var(--color-action)' },
              { label: 'Istirahat', value: `${activeConfig.restDuration}s`, color: 'var(--color-rest)' },
              { label: 'Repetisi', value: activeConfig.repetitionCount, color: 'var(--color-accent)' },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                <p className="text-xl font-bold mt-1" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Sesi Terbaru
          </h2>
          <Link href="/admin/sessions" className="text-sm" style={{ color: 'var(--color-accent)' }}>
            Lihat Semua →
          </Link>
        </div>

        {recentSessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Belum ada sesi. Mulai sesi pertama Anda.</p>
            <Link href="/session" className="btn btn-primary mt-4 inline-flex">
              Mulai Sesi
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Gesture</th>
                  <th>Partisipan</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-primary)' }}>{s.gesture.label}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.participantName || '-'}</td>
                    <td>
                      <span className={`badge ${
                        s.status === 'completed' ? 'badge-success' :
                        s.status === 'running' ? 'badge-info' :
                        s.status === 'aborted' ? 'badge-danger' : 'badge-neutral'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s._count.events}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      {new Date(s.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
