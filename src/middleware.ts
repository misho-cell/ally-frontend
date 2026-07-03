import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Admin and user sessions are separate: /admin/* is gated by the adminToken
// cookie, app routes by the user token cookie. The two never mix.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin')) {
    const adminToken = request.cookies.get('adminToken')?.value
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return NextResponse.next()
  }

  const token = request.cookies.get('token')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/chat',
    '/chat/:path*',
    '/admin/((?!login).+)',
    '/onboarding/:path*',
  ],
}
