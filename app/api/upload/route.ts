import { NextResponse } from 'next/server'
import { getSession } from '@/app/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('video') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: MP4, WebM, OGG' },
      { status: 400 }
    )
  }

  // Max 100MB
  const maxSize = 100 * 1024 * 1024
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: 'File too large. Maximum 100MB' },
      { status: 400 }
    )
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Create unique filename
  const ext = path.extname(file.name) || '.mp4'
  const filename = `gesture_${Date.now()}${ext}`

  // Ensure videos directory exists
  const videosDir = path.join(process.cwd(), 'public', 'videos')
  await mkdir(videosDir, { recursive: true })

  const filepath = path.join(videosDir, filename)
  await writeFile(filepath, buffer)

  const videoUrl = `/videos/${filename}`

  return NextResponse.json({ url: videoUrl }, { status: 201 })
}
