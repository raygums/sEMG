'use server'

import { prisma } from './prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  hashPassword,
  verifyPassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  getSession,
  ensureAdmin,
} from './auth'

// ============================================
// AUTH ACTIONS
// ============================================

export async function loginAction(formData: FormData) {
  await ensureAdmin()

  const username = formData.get('username') as string
  const password = formData.get('password') as string

  if (!username || !password) {
    return { error: 'Username dan password harus diisi' }
  }

  const admin = await prisma.admin.findUnique({ where: { username } })
  if (!admin) {
    return { error: 'Username atau password salah' }
  }

  const valid = await verifyPassword(password, admin.password)
  if (!valid) {
    return { error: 'Username atau password salah' }
  }

  const token = generateToken({ id: admin.id, username: admin.username })
  await setAuthCookie(token)
  redirect('/admin')
}

export async function logoutAction() {
  await clearAuthCookie()
  redirect('/login')
}

// ============================================
// GESTURE ACTIONS
// ============================================

export async function createGesture(formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const name = formData.get('name') as string
  const label = formData.get('label') as string
  const description = formData.get('description') as string | null
  const videoUrl = formData.get('videoUrl') as string | null
  const orderIndex = parseInt(formData.get('orderIndex') as string) || 0

  await prisma.gesture.create({
    data: { name, label, description, videoUrl, orderIndex },
  })

  revalidatePath('/admin/gestures')
}

export async function updateGesture(id: string, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const name = formData.get('name') as string
  const label = formData.get('label') as string
  const description = formData.get('description') as string | null
  const videoUrl = formData.get('videoUrl') as string | null
  const orderIndex = parseInt(formData.get('orderIndex') as string) || 0

  await prisma.gesture.update({
    where: { id },
    data: { name, label, description, videoUrl, orderIndex },
  })

  revalidatePath('/admin/gestures')
}

export async function deleteGesture(id: string) {
  const session = await getSession()
  if (!session) redirect('/login')

  await prisma.gesture.delete({ where: { id } })
  revalidatePath('/admin/gestures')
}

// ============================================
// CONFIG ACTIONS
// ============================================

export async function updateConfig(id: string, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const name = formData.get('name') as string
  const preparationDuration = parseInt(formData.get('preparationDuration') as string)
  const actionDuration = parseInt(formData.get('actionDuration') as string)
  const restDuration = parseInt(formData.get('restDuration') as string)
  const repetitionCount = parseInt(formData.get('repetitionCount') as string)

  await prisma.sessionConfig.update({
    where: { id },
    data: { name, preparationDuration, actionDuration, restDuration, repetitionCount },
  })

  revalidatePath('/admin/config')
}

export async function createConfig(formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const name = formData.get('name') as string
  const preparationDuration = parseInt(formData.get('preparationDuration') as string)
  const actionDuration = parseInt(formData.get('actionDuration') as string)
  const restDuration = parseInt(formData.get('restDuration') as string)
  const repetitionCount = parseInt(formData.get('repetitionCount') as string)

  // Deactivate others
  await prisma.sessionConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  })

  await prisma.sessionConfig.create({
    data: { name, preparationDuration, actionDuration, restDuration, repetitionCount, isActive: true },
  })

  revalidatePath('/admin/config')
}

export async function setActiveConfig(id: string) {
  const session = await getSession()
  if (!session) redirect('/login')

  await prisma.sessionConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  })
  await prisma.sessionConfig.update({
    where: { id },
    data: { isActive: true },
  })

  revalidatePath('/admin/config')
}

// ============================================
// SESSION ACTIONS
// ============================================

export async function createSession(gestureId: string, participantName?: string) {
  const config = await prisma.sessionConfig.findFirst({ where: { isActive: true } })
  if (!config) {
    // Create default config
    const defaultConfig = await prisma.sessionConfig.create({
      data: {
        name: 'Default',
        preparationDuration: 3,
        actionDuration: 5,
        restDuration: 3,
        repetitionCount: 10,
        isActive: true,
      },
    })
    const newSession = await prisma.session.create({
      data: {
        gestureId,
        configId: defaultConfig.id,
        participantName: participantName || null,
      },
      include: { gesture: true, config: true },
    })
    return newSession
  }

  const newSession = await prisma.session.create({
    data: {
      gestureId,
      configId: config.id,
      participantName: participantName || null,
    },
    include: { gesture: true, config: true },
  })

  return newSession
}

export async function updateSessionStatus(id: string, status: string) {
  const data: Record<string, unknown> = { status }
  if (status === 'running') data.startedAt = new Date()
  if (status === 'completed' || status === 'aborted') data.completedAt = new Date()

  await prisma.session.update({ where: { id }, data })
  revalidatePath('/admin/sessions')
}
