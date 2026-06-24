import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import type { Phase } from '@/app/generated/prisma/client'

// ============================================
// POST /api/sessions/[id]/emg
// ============================================
// Menerima batch EmgRecord dari Python bridge (bulk insert, ~tiap beberapa
// ratus ms atau saat buffer penuh). Bridge bertanggung jawab penuh untuk
// mengisi sampleIndex, elapsedMs, phase, dan isTransition per sample --
// endpoint ini hanya memvalidasi bentuk payload dan menulis ke DB.

interface IncomingSample {
  sampleIndex: number
  elapsedMs: number
  phase: 'PREPARATION' | 'ACTION' | 'REST'
  isTransition: boolean
  r1: number; r2: number; r3: number; r4: number; r5: number; r6: number
  p1: number; p2: number; p3: number; p4: number; p5: number; p6: number
}

interface EmgBatchPayload {
  samples: IncomingSample[]
}

const VALID_PHASES = new Set(['PREPARATION', 'ACTION', 'REST'])

function isValidSample(s: unknown): s is IncomingSample {
  if (typeof s !== 'object' || s === null) return false
  const obj = s as Record<string, unknown>

  const numericFields = [
    'sampleIndex', 'elapsedMs',
    'r1', 'r2', 'r3', 'r4', 'r5', 'r6',
    'p1', 'p2', 'p3', 'p4', 'p5', 'p6',
  ]
  for (const field of numericFields) {
    if (typeof obj[field] !== 'number' || !Number.isFinite(obj[field] as number)) {
      return false
    }
  }
  if (typeof obj.phase !== 'string' || !VALID_PHASES.has(obj.phase)) {
    return false
  }
  if (typeof obj.isTransition !== 'boolean') {
    return false
  }
  return true
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(_req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 1000, 10000)

  const records = await prisma.emgRecord.findMany({
    where: { sessionId: id },
    orderBy: { sampleIndex: 'asc' },
    take: limit,
  })

  return NextResponse.json(records)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  let body: EmgBatchPayload
  try {
    body = await request.json() as EmgBatchPayload
  } catch {
    return NextResponse.json(
      { error: 'Body bukan JSON yang valid' },
      { status: 400 }
    )
  }

  if (!Array.isArray(body?.samples) || body.samples.length === 0) {
    return NextResponse.json(
      { error: "Field 'samples' wajib berupa array dan tidak boleh kosong" },
      { status: 400 }
    )
  }

  // Validasi setiap sample sebelum insert — gagal satu, tolak seluruh batch
  for (let i = 0; i < body.samples.length; i++) {
    if (!isValidSample(body.samples[i])) {
      return NextResponse.json(
        { error: `Sample index ke-${i} dalam batch tidak valid`, sample: body.samples[i] },
        { status: 400 }
      )
    }
  }

  // Pastikan session memang ada sebelum insert
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true },
  })
  if (!session) {
    return NextResponse.json(
      { error: `Session ${sessionId} tidak ditemukan` },
      { status: 404 }
    )
  }

  try {
    const result = await prisma.emgRecord.createMany({
      data: body.samples.map((s) => ({
        sessionId,
        sampleIndex: s.sampleIndex,
        elapsedMs: s.elapsedMs,
        phase: s.phase as Phase,
        isTransition: s.isTransition,
        r1: s.r1, r2: s.r2, r3: s.r3, r4: s.r4, r5: s.r5, r6: s.r6,
        p1: s.p1, p2: s.p2, p3: s.p3, p4: s.p4, p5: s.p5, p6: s.p6,
      })),
    })

    return NextResponse.json({ inserted: result.count }, { status: 201 })
  } catch (err) {
    console.error('Gagal bulk insert EmgRecord:', err)
    return NextResponse.json(
      { error: 'Gagal menyimpan batch ke database' },
      { status: 500 }
    )
  }
}