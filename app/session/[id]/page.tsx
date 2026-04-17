import { prisma } from '@/app/lib/prisma'
import { redirect } from 'next/navigation'
import SessionRunner from '@/app/components/session/SessionRunner'

export default async function SessionRunnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      gesture: true,
      config: true,
    },
  })

  if (!session) {
    redirect('/session')
  }

  const serialized = {
    id: session.id,
    participantName: session.participantName,
    gesture: {
      id: session.gesture.id,
      name: session.gesture.name,
      label: session.gesture.label,
      videoUrl: session.gesture.videoUrl,
    },
    config: {
      preparationDuration: session.config.preparationDuration,
      actionDuration: session.config.actionDuration,
      restDuration: session.config.restDuration,
      repetitionCount: session.config.repetitionCount,
    },
  }

  return <SessionRunner session={serialized} />
}
