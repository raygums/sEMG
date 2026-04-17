import { prisma } from '@/app/lib/prisma'
import ConfigManager from '@/app/components/admin/ConfigManager'

export default async function ConfigPage() {
  const configs = await prisma.sessionConfig.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const serialized = configs.map((c) => ({
    id: c.id,
    name: c.name,
    preparationDuration: c.preparationDuration,
    actionDuration: c.actionDuration,
    restDuration: c.restDuration,
    repetitionCount: c.repetitionCount,
    isActive: c.isActive,
  }))

  return <ConfigManager configs={serialized} />
}
