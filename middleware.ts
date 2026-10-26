import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  try {
    const { data: { session } } = await supabase.auth.getSession()

    const pathname = req.nextUrl.pathname

    // El planificador no tiene sesión: la ruta valida por sí misma el Bearer CRON_SECRET.
    const isCronAutoCancel = pathname === '/api/reservas/auto-cancelar' && !!req.headers.get('authorization')

    const isPublicRoute = pathname === '/login' || pathname.startsWith('/api/auth') ||   pathname.startsWith('/api/whatsapp') || pathname.includes('favicon.ico') || isCronAutoCancel


    if (!session && !isPublicRoute) {
      return NextResponse.redirect(new URL('/login', req.url))
    }


    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  } catch {
    // Ante un error al validar la sesión no se deja pasar la solicitud a rutas privadas.
    const pathnameError = req.nextUrl.pathname
    const esPublica = pathnameError === '/login' || pathnameError.startsWith('/api/auth') || pathnameError.startsWith('/api/whatsapp') || pathnameError.includes('favicon.ico') || (pathnameError === '/api/reservas/auto-cancelar' && !!req.headers.get('authorization'))

    if (!esPublica) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|api/external).*)',
  ],
}
