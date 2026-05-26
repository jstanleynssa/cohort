// pages/auth/callback.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs'

// Browser client — reads the #fragment that getServerSideProps can never see
const supabase = createBrowserSupabaseClient()

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Signing you in…')

  useEffect(() => {
    // onAuthStateChange fires automatically when Supabase JS detects
    // #access_token=...&refresh_token=... in the URL fragment on page load
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth/callback] event:', event, '| user:', session?.user?.email ?? 'none')

      if (event === 'SIGNED_IN' && session) {
        setStatus('Signed in! Redirecting…')
        router.replace('/')
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setStatus('Session refreshed! Redirecting…')
        router.replace('/')
      }
    })

    // Fallback: if the user lands here with no fragment at all
    // (e.g. navigated directly), send them back to login
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('[auth/callback] No session after 5s — redirecting to login')
        router.replace('/login?error=no_session')
      }
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'sans-serif',
      color: '#555',
    }}>
      <p>{status}</p>
    </div>
  )
}

// Keep getServerSideProps for the future PKCE flow (code param).
// Right now this fires immediately with no code and returns props={},
// letting the page render so the client-side useEffect can run.
export async function getServerSideProps(context) {
  const { query } = context

  // PKCE flow — will work once you switch flowType to 'pkce' in Supabase
  if (query.code) {
    console.log('[auth/callback] PKCE code param detected server-side')
    const { createServerSupabaseClient } = await import('@supabase/auth-helpers-nextjs')
    const supabase = createServerSupabaseClient(context)

    const { data, error } = await supabase.auth.exchangeCodeForSession(query.code)

    if (error) {
      console.error('[auth/callback] PKCE exchange error:', error.message)
      return { redirect: { destination: `/login?error=${encodeURIComponent(error.message)}`, permanent: false } }
    }

    console.log('[auth/callback] PKCE session established:', data?.session?.user?.email)
    return { redirect: { destination: '/', permanent: false } }
  }

  // No code — fall through to client-side fragment handling
  console.log('[auth/callback] No code param — deferring to client-side fragment handler')
  return { props: {} }
}