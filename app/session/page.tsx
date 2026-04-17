import { prisma } from '@/app/lib/prisma'
import Link from 'next/link'
import SessionStarter from '@/app/components/session/SessionStarter'

export default async function SessionPage() {
  const gestures = await prisma.gesture.findMany({
    orderBy: { orderIndex: 'asc' },
  })

  const config = await prisma.sessionConfig.findFirst({ where: { isActive: true } })

  if (gestures.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center glass-card p-12 max-w-md">
          <div className="text-5xl mb-4">🤚</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Belum Ada Gesture</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Tambahkan gesture terlebih dahulu di Dashboard Admin sebelum memulai sesi.
          </p>
          <Link href="/admin/gestures" className="btn btn-primary">
            Ke Dashboard Admin
          </Link>
        </div>
      </div>
    )
  }

  const serializedGestures = gestures.map(g => ({
    id: g.id,
    name: g.name,
    label: g.label,
    description: g.description,
    videoUrl: g.videoUrl,
    orderIndex: g.orderIndex,
  }))

  const serializedConfig = config ? {
    id: config.id,
    name: config.name,
    preparationDuration: config.preparationDuration,
    actionDuration: config.actionDuration,
    restDuration: config.restDuration,
    repetitionCount: config.repetitionCount,
  } : null

  return <SessionStarter gestures={serializedGestures} config={serializedConfig} />
}
