import { prisma } from '@/app/lib/prisma'
import { Prisma } from '@/app/generated/prisma/client'
import { NextResponse } from 'next/server'
import { exportToCSV, exportToJSON } from '@/app/lib/export'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(_req.url)
  const format = url.searchParams.get('format') // csv or json

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      gesture: true,
      config: true,
      events: { orderBy: { timestamp: 'asc' } },
    },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const exportData = {
    sessionId: session.id,
    participantName: session.participantName || 'Unknown',
    gestureName: session.gesture.name,
    gestureLabel: session.gesture.label,
    events: session.events.map((e) => ({
      eventType: e.eventType,
      repetitionNum: e.repetitionNum,
      timestamp: e.timestamp.toISOString(),
      clientTimestamp: e.clientTimestamp.toString(),
      metadata: e.metadata as Record<string, unknown> | null,
    })),
  }

  if (format === 'csv') {
    const csv = exportToCSV(exportData)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="session_${id}.csv"`,
      },
    })
  }

  if (format === 'json') {
    const json = exportToJSON(exportData)
    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="session_${id}.json"`,
      },
    })
  }

  return NextResponse.json(session.events)
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await _req.json()

  // Batch insert events
  if (Array.isArray(body)) {
    const events = await prisma.eventLog.createMany({
      data: body.map((event: { eventType: string; repetitionNum?: number; clientTimestamp: number; metadata?: Prisma.InputJsonValue }) => ({
        sessionId: id,
        eventType: event.eventType,
        repetitionNum: event.repetitionNum ?? null,
        clientTimestamp: BigInt(event.clientTimestamp),
        metadata: event.metadata ?? Prisma.JsonNull,
      })),
    })
    return NextResponse.json({ count: events.count }, { status: 201 })
  }

  // Single event insert
  const event = await prisma.eventLog.create({
    data: {
      sessionId: id,
      eventType: body.eventType,
      repetitionNum: body.repetitionNum ?? null,
      clientTimestamp: BigInt(body.clientTimestamp),
      metadata: body.metadata ?? Prisma.JsonNull,
    },
  })

  return NextResponse.json({
    ...event,
    clientTimestamp: event.clientTimestamp.toString(),
  }, { status: 201 })
}
