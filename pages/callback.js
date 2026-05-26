import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export async function getServerSideProps(context) {
  const supabaseServer = createServerSupabaseClient(context)
  
  const { data, error } = await supabaseServer.auth.exchangeCodeForSession(
    context.query.code
  )

  if (error || !data.session) {
    return { redirect: { destination: '/login?error=auth', permanent: false } }
  }

  return { redirect: { destination: '/', permanent: false } }
}

export default function AuthCallback() {
  return null
}