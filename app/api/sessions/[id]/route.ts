import { prisma } from '@/app/lib/prisma'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type AllowedStatus = 'pending' | 'running' | 'completed' | 'aborted'
const ALLOWED_STATUSES: AllowedStatus[] = ['pending', 'running', 'completed', 'aborted']

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/[id]
// Lightweight by default (no events) — safe to poll every 500 ms.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await prisma.session.findUnique({
    where: { id },
    include: { gesture: true, config: true },
  })

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sessions/[id]
// Admin: update session status.  Only whitelisted fields are written.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate status value
  if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status as AllowedStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 422 },
    )
  }

  // Build a whitelisted update payload
  const data: Record<string, unknown> = {}

  if (body.status !== undefined) {
    data.status = body.status
    if (body.status === 'running')   data.startedAt   = new Date()
    if (body.status === 'completed' || body.status === 'aborted')
                                      data.completedAt = new Date()
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  try {
    const session = await prisma.session.update({
      where: { id },
      data,
      include: { gesture: true, config: true },
    })
    return NextResponse.json(session)
  } catch {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sessions/[id]
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await prisma.session.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
