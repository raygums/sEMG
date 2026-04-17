import { prisma } from '@/app/lib/prisma'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await prisma.session.findUnique({
    where: { id },
    include: { gesture: true, config: true, events: { orderBy: { timestamp: 'asc' } } },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session)
}

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await _req.json()

  const data: Record<string, unknown> = { ...body }
  if (body.status === 'running') data.startedAt = new Date()
  if (body.status === 'completed' || body.status === 'aborted') data.completedAt = new Date()

  const session = await prisma.session.update({
    where: { id },
    data,
    include: { gesture: true, config: true },
  })

  return NextResponse.json(session)
}
