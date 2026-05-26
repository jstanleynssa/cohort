// pages/auth/callback.js
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export async function getServerSideProps(context) {
  const { query, req, res } = context

  // ── DEBUG: log everything arriving at this route ──────────────────────────
  console.log('[auth/callback] === INCOMING REQUEST ===')
  console.log('[auth/callback] query params:', JSON.stringify(query, null, 2))
  console.log('[auth/callback] cookies:', JSON.stringify(req.cookies, null, 2))
  console.log('[auth/callback] headers (auth-related):', JSON.stringify({
    host: req.headers['host'],
    referer: req.headers['referer'],
    'x-forwarded-proto': req.headers['x-forwarded-proto'],
    'x-forwarded-host': req.headers['x-forwarded-host'],
  }, null, 2))
  // ─────────────────────────────────────────────────────────────────────────

  const supabase = createServerSupabaseClient(context)

  // Magic link / PKCE flow: Supabase passes `code` as a query param
  const code = query.code

  if (code) {
    console.log('[auth/callback] code param found, attempting exchangeCodeForSession...')
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      console.log('[auth/callback] exchangeCodeForSession result:', JSON.stringify({ data, error }, null, 2))

      if (error) {
        console.error('[auth/callback] ERROR exchanging code:', error.message)
        return {
          redirect: { destination: `/login?error=${encodeURIComponent(error.message)}`, permanent: false },
        }
      }

      console.log('[auth/callback] Session established for user:', data?.session?.user?.email)
      return { redirect: { destination: '/', permanent: false } }

    } catch (err) {
      console.error('[auth/callback] EXCEPTION during exchange:', err)
      return {
        redirect: { destination: '/login?error=exception', permanent: false },
      }
    }
  }

  // Legacy token+type flow (older Supabase magic links)
  const token = query.token
  const type = query.type

  if (token && type) {
    console.log('[auth/callback] Legacy token flow — token type:', type)
    try {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type })
      console.log('[auth/callback] verifyOtp result:', JSON.stringify({ data, error }, null, 2))

      if (error) {
        console.error('[auth/callback] ERROR verifying OTP:', error.message)
        return {
          redirect: { destination: `/login?error=${encodeURIComponent(error.message)}`, permanent: false },
        }
      }

      console.log('[auth/callback] OTP verified, user:', data?.session?.user?.email)
      return { redirect: { destination: '/', permanent: false } }

    } catch (err) {
      console.error('[auth/callback] EXCEPTION during OTP verify:', err)
      return {
        redirect: { destination: '/login?error=exception', permanent: false },
      }
    }
  }

  // No code or token — log what we actually got
  console.warn('[auth/callback] No `code` or `token` param found in query. Full query was:', query)
  return {
    redirect: { destination: '/login?error=no_code', permanent: false },
  }
}

export default function AuthCallback() {
  return null
}