import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/router'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // only allow existing users
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setStep('code')
      setLoading(false)
    }
  }

  async function handleCodeSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.replace('/')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/nssa-irmaa-logos.png"
            alt="NSSA and IRMAACP logos"
            style={{ height: '50px', width: 'auto', marginBottom: '1.5rem' }}
          />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>
            Partner Dashboard
          </h1>
          <p style={{ color: '#666', fontSize: '14px' }}>
            {step === 'email'
              ? 'Enter your email to receive a login code'
              : `Enter the 6-digit code sent to ${email}`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            {error && (
              <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '1rem' }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              style={{
                width: '100%',
                padding: '10px',
                background: '#13405E',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loading || !email ? 'not-allowed' : 'pointer',
                opacity: loading || !email ? 0.6 : 1
              }}
            >
              {loading ? 'Sending...' : 'Send login code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
                6-digit code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                required
                placeholder="123456"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '24px',
                  letterSpacing: '0.5em',
                  textAlign: 'center',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            {error && (
              <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '1rem' }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || token.length !== 6}
              style={{
                width: '100%',
                padding: '10px',
                background: '#13405E',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loading || token.length !== 6 ? 'not-allowed' : 'pointer',
                opacity: loading || token.length !== 6 ? 0.6 : 1
              }}
            >
              {loading ? 'Verifying...' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setToken(''); setError(null) }}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                color: '#6b7280',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '8px'
              }}
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}