import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export async function getServerSideProps(context) {
  const supabaseServer = createServerSupabaseClient(context)
  const { code, token, type, token_hash } = context.query

  try {
    if (code) {
      await supabaseServer.auth.exchangeCodeForSession(code)
    } else if (token_hash && type) {
      await supabaseServer.auth.verifyOtp({
        token_hash,
        type
      })
    } else if (token && type) {
      await supabaseServer.auth.verifyOtp({
        token_hash: token,
        type
      })
    }
  } catch (err) {
    console.error('Auth callback error:', err)
  }

  const { data: { session } } = await supabaseServer.auth.getSession()

  if (!session) {
    console.error('No session after callback')
    return { redirect: { destination: '/login?error=auth', permanent: false } }
  }

  return { redirect: { destination: '/', permanent: false } }
}

export default function AuthCallback() {
  return null
}