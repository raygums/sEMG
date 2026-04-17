import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const configs = await prisma.sessionConfig.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(configs)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  // Deactivate all others if this is set active
  if (body.isActive) {
    await prisma.sessionConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })
  }

  const config = await prisma.sessionConfig.create({ data: body })
  return NextResponse.json(config, { status: 201 })
}
