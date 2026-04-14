'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function SetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const uid = params.get('uid') || ''
  const otpFromLink = params.get('otp') || ''

  const [step, setStep] = useState<'otp'|'password'|'done'>(otpFromLink ? 'password' : 'otp')
  const [otp, setOtp] = useState(otpFromLink)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verifiedOtp, setVerifiedOtp] = useState(otpFromLink)

  // Auto-verify if OTP came from link
  useEffect(() => {
    if (otpFromLink && uid) {
      fetch('/api/users/otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, otp: otpFromLink })
      }).then(r => r.json()).then(d => {
        if (!d.success) { setError(d.message); setStep('otp') }
      })
    }
  }, [])

  async function verifyOtp() {
    if (!otp || !uid) { setError('Enter your OTP.'); return }
    setLoading(true); setError('')
    const d = await fetch('/api/users/otp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, otp })
    }).then(r => r.json())
    setLoading(false)
    if (!d.success) { setError(d.message); return }
    setVerifiedOtp(otp)
    setStep('password')
  }

  async function setNewPassword() {
    if (!password) { setError('Enter a password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    const d = await fetch('/api/users/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, otp: verifiedOtp, password })
    }).then(r => r.json())
    setLoading(false)
    if (!d.success) { setError(d.message); return }
    setStep('done')
  }

  const inp = (val: string, set: (v: string) => void, ph: string, type = 'text') => (
    <input type={type} value={val} onChange={e => { set(e.target.value); setError('') }}
      placeholder={ph}
      style={{ width: '100%', background: '#1a2235', border: '1px solid #1e2d45', borderRadius: 8, padding: '11px 14px', color: '#e2e8f0', fontSize: '.9rem', fontFamily: "'IBM Plex Sans',sans-serif", outline: 'none', marginBottom: 18 }}
    />
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,114,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,114,255,0.04) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', background: '#111827', border: '1px solid #1e2d45', borderRadius: 16, padding: '40px 44px', width: 420, maxWidth: '95vw', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 46, height: 46, background: 'linear-gradient(135deg,#0072ff,#00c2ff)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🛡️</div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e2e8f0' }}>AeroGuard</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1.5px', textTransform: 'uppercase' }}>Account Activation</div>
          </div>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: 8, padding: '10px 14px', fontSize: '.8rem', marginBottom: 16 }}>⚠️ {error}</div>}

        {step === 'otp' && (
          <>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4, color: '#e2e8f0' }}>Enter Your OTP</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 24 }}>Check your email for a 6-digit verification code.</div>
            <label style={{ fontSize: '.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>OTP Code</label>
            {inp(otp, setOtp, '123456')}
            <button onClick={verifyOtp} disabled={loading} style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg,#0072ff,#00c2ff)', color: 'white', border: 'none', borderRadius: 8, fontSize: '.9rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 4, color: '#e2e8f0' }}>Set Your Password</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 24 }}>Choose a strong password (minimum 8 characters).</div>
            <label style={{ fontSize: '.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>New Password</label>
            {inp(password, setPassword, '••••••••', 'password')}
            <label style={{ fontSize: '.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Confirm Password</label>
            {inp(confirm, setConfirm, '••••••••', 'password')}
            <button onClick={setNewPassword} disabled={loading} style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg,#0072ff,#00c2ff)', color: 'white', border: 'none', borderRadius: 8, fontSize: '.9rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Saving…' : 'Set Password & Activate Account'}
            </button>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Account Activated!</div>
            <div style={{ fontSize: '.85rem', color: '#64748b', marginBottom: 24 }}>Your account is ready. You can now sign in.</div>
            <button onClick={() => router.push('/login')} style={{ padding: '10px 28px', background: 'linear-gradient(135deg,#0072ff,#00c2ff)', color: 'white', border: 'none', borderRadius: 8, fontSize: '.9rem', fontWeight: 700, cursor: 'pointer' }}>Go to Login</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  )
}