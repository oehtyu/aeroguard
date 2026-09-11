'use client'
import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function PushSubscribe() {
  const [status, setStatus] = useState<'idle' | 'unsupported' | 'subscribed' | 'error'>('idle')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      if (existing) setStatus('subscribed')
    })
  }, [])

  const subscribe = async () => {
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('error'); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
      setStatus('subscribed')
    } catch (err) {
      console.error('[PUSH] Subscribe failed:', err)
      setStatus('error')
    }
  }

  if (status === 'unsupported') return null // iOS: only shows up once added to Home Screen
  if (status === 'subscribed')
    return <div style={{fontSize:'.75rem',color:'var(--green)'}}>🔔 Notifications enabled</div>

  return (
    <button onClick={subscribe} style={{
      background:'var(--accent, #388fd6)',color:'#fff',border:'none',borderRadius:6,
      padding:'8px 14px',fontSize:'.8rem',fontWeight:600,cursor:'pointer'
    }}>
      🔔 Enable Notifications
    </button>
  )
}