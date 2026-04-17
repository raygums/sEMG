import { prisma } from '@/app/lib/prisma'
import SessionHistory from '@/app/components/admin/SessionHistory'

export default async function SessionsPage() {
  const sessions = await prisma.session.findMany({
    include: {
      gesture: true,
      config: true,
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const serialized = sessions.map((s) => ({
    id: s.id,
    participantName: s.participantName,
    status: s.status,
    gestureName: s.gesture.name,
    gestureLabel: s.gesture.label,
    configName: s.config.name,
    eventCount: s._count.events,
    startedAt: s.startedAt?.toISOString() || null,
    completedAt: s.completedAt?.toISOString() || null,
    createdAt: s.createdAt.toISOString(),
  }))

  return <SessionHistory sessions={serialized} />
}
