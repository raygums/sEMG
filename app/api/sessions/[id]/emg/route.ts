import { prisma } from '@/app/lib/prisma'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

interface IncomingEmgSample {
  deviceTimestampUs: number | string
  raw: number[]      
  envelope: number[] 
}

const EXPECTED_CHANNELS = 6

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(_req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 1000, 10000)

  const samples = await prisma.emgSample.findMany({
    where: { sessionId: id },
    orderBy: { receivedAt: 'asc' },
    take: limit,
  })

  return NextResponse.json(
    samples.map((s: { deviceTimestampUs: bigint; [key: string]: unknown }) => ({
      ...s,
      deviceTimestampUs: s.deviceTimestampUs.toString(),
    }))
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await prisma.session.findUnique({ where: { id }, select: { id: true } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const body = await _req.json()
  const samples: IncomingEmgSample[] = Array.isArray(body) ? body : [body]

  if (samples.length === 0) {
    return NextResponse.json({ count: 0 }, { status: 201 })
  }

  for (const s of samples) {
    if (!Array.isArray(s.raw) || !Array.isArray(s.envelope)) {
      return NextResponse.json(
        { error: 'Each sample requires raw[] and envelope[] arrays' },
        { status: 400 }
      )
    }
    if (s.raw.length !== EXPECTED_CHANNELS || s.envelope.length !== EXPECTED_CHANNELS) {
      return NextResponse.json(
        { error: `Expected ${EXPECTED_CHANNELS} channels, got raw=${s.raw.length} envelope=${s.envelope.length}` },
        { status: 400 }
      )
    }
  }

  const created = await prisma.emgSample.createMany({
    data: samples.map((s) => ({
      sessionId: id,
      deviceTimestampUs: BigInt(s.deviceTimestampUs),
      raw: s.raw,
      envelope: s.envelope,
    })),
  })

  return NextResponse.json({ count: created.count }, { status: 201 })
}