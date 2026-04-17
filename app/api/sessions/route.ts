import { prisma } from '@/app/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const sessions = await prisma.session.findMany({
    include: { gesture: true, config: true, _count: { select: { events: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(sessions)
}

export async function POST(request: Request) {
  const body = await request.json()

  let config = await prisma.sessionConfig.findFirst({ where: { isActive: true } })
  if (!config) {
    config = await prisma.sessionConfig.create({
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

  const session = await prisma.session.create({
    data: {
      gestureId: body.gestureId,
      configId: config.id,
      participantId: body.participantId || null,
      participantName: body.participantName || null,
      age: body.age ? parseInt(body.age) : null,
      gender: body.gender || null,
      dominantHand: body.dominantHand || null,
      condition: body.condition || null,
    },
    include: { gesture: true, config: true },
  })

  return NextResponse.json(session, { status: 201 })
}
