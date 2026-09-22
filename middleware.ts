import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  try {
    const { data: { session } } = await supabase.auth.getSession()

    const pathname = req.nextUrl.pathname

    const isPublicRoute = pathname === '/login' || pathname.startsWith('/api/auth') ||   pathname.startsWith('/api/whatsapp') || pathname.includes('favicon.ico')


    if (!session && !isPublicRoute) {
      return NextResponse.redirect(new URL('/login', req.url))
    }


    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  } catch {
  }
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|api/external).*)',
  ],
}
