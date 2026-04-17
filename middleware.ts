import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = process.env.JWT_SECRET || 'emg-acquisition-secret-key-change-in-production'
const COOKIE_NAME = 'emg_auth_token'

export async function middleware(request: NextRequest) {
  // If the request doesn't target an admin route, let it pass
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const token = request.cookies.get(COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET)
    // Verify using jose which is Edge Runtime compatible
    await jwtVerify(token, secret)
    return NextResponse.next()
  } catch (error) {
    // Token is invalid or expired
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/admin/:path*'],
}
