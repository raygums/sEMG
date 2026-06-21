import { prisma } from '@/app/lib/prisma'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Called by the Python gateway when BLE connectivity changes.
//   { status: "disconnected", note?: string }  -> opens a new GatewayEvent
//   { status: "reconnected" }                   -> closes the most recent open GatewayEvent
//
// SessionRunner polls GET on this route to decide whether to pause the phase
// timeline (see GET below).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await prisma.session.findUnique({ where: { id }, select: { id: true } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const body = await req.json()
  const status = body?.status

  if (status === 'disconnected') {
    // Avoid creating duplicate open events if the gateway sends repeated
    // "disconnected" reports (e.g. retries) before reconnecting.
    const openEvent = await prisma.gatewayEvent.findFirst({
      where: { sessionId: id, reconnectedAt: null },
      orderBy: { disconnectedAt: 'desc' },
    })
    if (openEvent) {
      return NextResponse.json(openEvent, { status: 200 })
    }

    const created = await prisma.gatewayEvent.create({
      data: {
        sessionId: id,
        note: typeof body?.note === 'string' ? body.note : null,
      },
    })
    return NextResponse.json(created, { status: 201 })
  }

  if (status === 'reconnected') {
    const openEvent = await prisma.gatewayEvent.findFirst({
      where: { sessionId: id, reconnectedAt: null },
      orderBy: { disconnectedAt: 'desc' },
    })

    if (!openEvent) {
      // Nothing to close - report as a no-op rather than an error, since the
      // gateway may send a "reconnected" report on startup with no prior gap.
      return NextResponse.json({ message: 'No open gateway event to close' }, { status: 200 })
    }

    const updated = await prisma.gatewayEvent.update({
      where: { id: openEvent.id },
      data: { reconnectedAt: new Date() },
    })
    return NextResponse.json(updated, { status: 200 })
  }

  return NextResponse.json({ error: 'status must be "disconnected" or "reconnected"' }, { status: 400 })
}

// Polled by SessionRunner (e.g. every 1-2s) to check whether the gateway is
// currently in a disconnected state, so the phase timeline can be paused.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const openEvent = await prisma.gatewayEvent.findFirst({
    where: { sessionId: id, reconnectedAt: null },
    orderBy: { disconnectedAt: 'desc' },
  })

  const recentEvents = await prisma.gatewayEvent.findMany({
    where: { sessionId: id },
    orderBy: { disconnectedAt: 'desc' },
    take: 10,
  })

  return NextResponse.json({
    connected: !openEvent,
    openEvent,
    recentEvents,
  })
}
