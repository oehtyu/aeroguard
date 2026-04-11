'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin() {
    if (!username || !password) { setError('Please enter both username and password.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!data.success) { setError(data.message); setLoading(false); return }
      localStorage.setItem('ag_user', JSON.stringify(data.user))
      router.push('/dashboard')
    } catch {
      setError('Cannot reach server.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', position: 'relative', overflow: 'hidden'
    }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(0,114,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,114,255,0.04) 1px,transparent 1px)',
        backgroundSize: '40px 40px', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', width: 600, height: 600,
        background: 'radial-gradient(circle,rgba(0,114,255,0.08) 0%,transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none'
      }} />

      <div style={{
        position: 'relative', background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '40px 44px', width: 420, maxWidth: '95vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 46, height: 46,
            background: 'linear-gradient(135deg,#0072ff,#00c2ff)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
          }}>🛡️</div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>AeroGuard</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>BPSU Fire Safety System</div>
          </div>
        </div>

        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4 }}>Sign in to continue</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 28 }}>Authorized personnel only — BPSU Main Campus</div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
            color: 'var(--red)', borderRadius: 8, padding: '10px 14px',
            fontSize: '.8rem', marginBottom: 16
          }}>⚠️ &nbsp;{error}</div>
        )}

        <label style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Username</label>
        <input
          value={username} onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="Enter your username"
          style={{
            width: '100%', background: 'var(--panel2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '11px 14px', color: 'var(--text)', fontSize: '.9rem',
            fontFamily: 'var(--font)', outline: 'none', marginBottom: 18
          }}
        />

        <label style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Password</label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="Enter your password"
          style={{
            width: '100%', background: 'var(--panel2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '11px 14px', color: 'var(--text)', fontSize: '.9rem',
            fontFamily: 'var(--font)', outline: 'none', marginBottom: 22
          }}
        />

        <button
          onClick={handleLogin} disabled={loading}
          style={{
            width: '100%', padding: 12,
            background: 'linear-gradient(135deg,#0072ff,#00c2ff)',
            color: 'white', border: 'none', borderRadius: 8,
            fontSize: '.9rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1, fontFamily: 'var(--font)'
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
