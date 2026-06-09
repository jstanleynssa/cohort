import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  // getUser() verifies the JWT against the auth server; getSession() only
  // decodes the cookie. Use the verified call for the access gate.
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = req.nextUrl.pathname === '/login'
  const isCallbackPage = req.nextUrl.pathname === '/auth/callback'

  // Never block the callback — session isn't established yet when this runs
  if (isCallbackPage) {
    return res
  }

  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|nssa-irmaa-logos.png).*)']
}