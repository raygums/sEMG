import { prisma } from '@/app/lib/prisma'
import Link from 'next/link'
import SessionCreator from '@/app/components/admin/SessionCreator'

export default async function NewSessionPage() {
  const gestures = await prisma.gesture.findMany({
    orderBy: { orderIndex: 'asc' },
  })

  const config = await prisma.sessionConfig.findFirst({ where: { isActive: true } })

  if (gestures.length === 0) {
    return (
      <div className="glass-card p-12 text-center max-w-md mx-auto">
        <div className="text-5xl mb-4">🤚</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Belum Ada Gesture</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Tambahkan gesture terlebih dahulu sebelum membuat sesi.
        </p>
        <Link href="/admin/gestures" className="btn btn-primary">
          Kelola Gesture
        </Link>
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

  return <SessionCreator gestures={serializedGestures} config={serializedConfig} />
}
