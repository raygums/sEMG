import { prisma } from '@/app/lib/prisma'
import GestureManager from '@/app/components/admin/GestureManager'

export default async function GesturesPage() {
  const gestures = await prisma.gesture.findMany({
    orderBy: { orderIndex: 'asc' },
  })

  const serialized = gestures.map((g) => ({
    ...g,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  }))

  return <GestureManager gestures={serialized as unknown as Parameters<typeof GestureManager>[0]['gestures']} />
}
