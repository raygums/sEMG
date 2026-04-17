import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = process.env.JWT_SECRET || 'emg-acquisition-secret-key-change-in-production'
const COOKIE_NAME = 'emg_auth_token'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE_NAME)?.value

  // Protect /admin routes
  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET)
      // Secure cryptographically verified validation via jose
      await jwtVerify(token, secret)
    } catch {
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete(COOKIE_NAME)
      return response
    }
  }

  // Redirect /login if already authenticated
  if (pathname === '/login' && token) {
    try {
      const secret = new TextEncoder().encode(JWT_SECRET)
      await jwtVerify(token, secret)
      return NextResponse.redirect(new URL('/admin', request.url))
    } catch {
      // Invalid token, let them login
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
}
