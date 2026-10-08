'use client'

import { useState } from 'react'

// A short reference card for the 2D campus map, shown in the Help guide. Panel feedback was that
// new users (admins included) find the map hard to read on its own.

type Row = { swatch: React.ReactNode; label: string; note?: string }

function Swatch({ color, shape = 'square', dashed = false }: { color: string; shape?: 'square' | 'circle' | 'line'; dashed?: boolean }) {
  if (shape === 'line') {
    return <div style={{ width: 22, height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
  }
  return (
    <div style={{
      width: 16, height: 16, background: color, borderRadius: shape === 'circle' ? '50%' : 3,
      border: dashed ? `1.5px dashed ${color}` : '1px solid rgba(255,255,255,.25)',
      flexShrink: 0,
    }} />
  )
}

export default function MapLegend() {
  const [open, setOpen] = useState(true)

  const placeRows: Row[] = [
    { swatch: <Swatch color="#3b82f6" />, label: 'Building' },
    { swatch: <Swatch color="#334155" />, label: 'Room', note: 'inside a building' },
    { swatch: <Swatch color="#60a5fa" shape="line" />, label: 'Wall' },
    { swatch: <Swatch color="#22c55e" />, label: 'Gate' },
    { swatch: <Swatch color="#16a34a" />, label: 'Trees / green area' },
    { swatch: <Swatch color="#22c55e" dashed />, label: 'Assembly Area (Zone 2 / Zone 3)', note: 'where everyone gathers' },
    { swatch: <Swatch color="#22c55e" />, label: 'EXIT door', note: 'where routes leave a building' },
  ]

  const extRows: Row[] = [
    { swatch: <Swatch color="#f97316" />, label: '🧯 Extinguisher — Active', note: 'ready to use' },
    { swatch: <Swatch color="#eab308" />, label: '🧯 Extinguisher — Maintenance', note: 'not usable' },
    { swatch: <Swatch color="#ef4444" />, label: '🧯 Extinguisher — Expired', note: 'not usable' },
    { swatch: <Swatch color="#22c55e" shape="circle" />, label: 'Pulsing green ring', note: 'one of the 3 nearest available, during an alert' },
  ]

  const routeRows: Row[] = [
    { swatch: <Swatch color="#22c55e" shape="line" dashed />, label: 'Green dashed line', note: 'standard route from a building to its assembly area (always shown)' },
    { swatch: <Swatch color="#ef4444" shape="line" />, label: 'Red line', note: 'live route from the alerting room during an Orange/Red alert' },
    { swatch: <Swatch color="#22c55e" dashed />, label: 'Glowing assembly area', note: 'the one you are being sent to during an alert' },
  ]

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none',
                 color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '.82rem', fontWeight: 600, textAlign: 'left' }}>
        <span>🗺️ Map legend</span>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '.72rem', fontWeight: 400 }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '2px 14px 14px', display: 'grid', gap: 14 }}>
          <Section title="Places" rows={placeRows} />
          <Section title="Extinguishers" rows={extRows} />
          <Section title="Evacuation routes" rows={routeRows} />
        </div>
      )}
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <div style={{ fontSize: '.66rem', fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.76rem' }}>
            {r.swatch}
            <span>
              {r.label}
              {r.note && <span style={{ color: 'var(--muted)' }}> — {r.note}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
