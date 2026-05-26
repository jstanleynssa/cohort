import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export async function getServerSideProps(context) {
  const supabaseServer = createServerSupabaseClient(context)
  const { code, token, type } = context.query

  if (code) {
    await supabaseServer.auth.exchangeCodeForSession(code)
  }

  if (token && type) {
    await supabaseServer.auth.verifyOtp({
      token_hash: token,
      type: type
    })
  }

  const { data: { session } } = await supabaseServer.auth.getSession()

  if (!session) {
    return { redirect: { destination: '/login?error=auth', permanent: false } }
  }

  return { redirect: { destination: '/', permanent: false } }
}

export default function AuthCallback() {
  return null
}