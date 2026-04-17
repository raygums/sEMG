import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect /admin routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('emg_auth_token')?.value

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Edge-compatible JWT structure check (header.payload.signature)
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
      // Decode payload to check expiry
      const payload = JSON.parse(atob(parts[1]))
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        const response = NextResponse.redirect(new URL('/login', request.url))
        response.cookies.delete('emg_auth_token')
        return response
      }
    } catch {
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('emg_auth_token')
      return response
    }
  }

  // Redirect /login if already authenticated
  if (pathname === '/login') {
    const token = request.cookies.get('emg_auth_token')?.value
    if (token) {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          if (!payload.exp || payload.exp * 1000 > Date.now()) {
            return NextResponse.redirect(new URL('/admin', request.url))
          }
        }
      } catch {
        // Invalid token, let them login
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
}
