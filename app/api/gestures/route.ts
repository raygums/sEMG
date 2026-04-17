import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const gestures = await prisma.gesture.findMany({
    orderBy: { orderIndex: 'asc' },
  })
  return NextResponse.json(gestures)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const gesture = await prisma.gesture.create({ data: body })
  return NextResponse.json(gesture, { status: 201 })
}
