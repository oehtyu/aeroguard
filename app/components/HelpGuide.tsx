'use client'

import { useState } from 'react'
import MapLegend from './MapLegend'

// Self-contained help modal. Triggered from a "?" button in the top bar. Written for two
// audiences: any signed-in user (Dashboard / Campus Map / Incident Reporting), and admins
// (Devices / Incident Log / User Accounts / Extinguishers).

type SectionId = 'start' | 'map' | 'alerts' | 'admin'

export default function HelpGuide({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const sections: { id: SectionId; label: string; icon: string }[] = [
    { id: 'start', label: 'Getting started', icon: '👋' },
    { id: 'map', label: 'Reading the map', icon: '🗺️' },
    { id: 'alerts', label: 'Alerts & evacuation', icon: '🚨' },
    ...(isAdmin ? ([
      { id: 'admin', label: 'Admin tools', icon: '🛠️' },
    ] as const) : []),
  ]
  const [section, setSection] = useState<SectionId>('start')

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', overflow: 'hidden' }}>
        {/* section list */}
        <div style={{ width: 190, flexShrink: 0, borderRight: '1px solid var(--border)', padding: 10, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <div style={{ fontSize: '.9rem', fontWeight: 700, padding: '6px 10px 10px' }}>❓ Help</div>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 10px', borderRadius: 7, fontSize: '.8rem', fontFamily: 'var(--font)',
                       cursor: 'pointer', border: 'none', background: section === s.id ? 'var(--panel2)' : 'transparent', color: section === s.id ? 'var(--accent)' : 'var(--text)', fontWeight: section === s.id ? 600 : 400 }}>
              <span>{s.icon}</span>{s.label}
            </button>
          ))}
        </div>

        {/* content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' }}>
            <button onClick={onClose} aria-label="Close help" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div style={{ padding: '4px 26px 26px', overflowY: 'auto', fontSize: '.85rem', lineHeight: 1.6 }}>
            {section === 'start' && <GettingStarted isAdmin={isAdmin} />}
            {section === 'map' && <ReadingMap />}
            {section === 'alerts' && <Alerts />}
            {section === 'admin' && <AdminTools />}
          </div>
        </div>
      </div>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>{children}</h3>
}
function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ margin: '0 0 12px', color: 'var(--muted)', ...style }}>{children}</p>
}
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <span style={{ flex: '0 0 20px', height: 20, borderRadius: '50%', background: 'var(--panel2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: '.68rem', fontWeight: 700, color: 'var(--accent)' }}>{n}</span>
      <span>{children}</span>
    </div>
  )
}

function GettingStarted({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <H>What each page is for</H>
      <P>The sidebar is grouped into two sections.</P>
      <Step n={1}><strong>Monitor</strong> — Dashboard (live status and any active alert), Campus Map (where every sensor, extinguisher, and route sits), and Incident Reporting (your own responder reports).</Step>
      {isAdmin && <Step n={2}><strong>Manage</strong> — admin-only: User Accounts, Incident Log, Devices, Extinguishers. These have a 🔒 for non-admins.</Step>}
      <Step n={isAdmin ? 3 : 2}>Click <strong>❓ Help</strong> in the top bar any time you need this guide again.</Step>
      <P>Tip: switch between light and dark mode with the {'\u2600\ufe0f/\ud83c\udf19'} button next to Help — your choice is remembered.</P>
    </>
  )
}

function ReadingMap() {
  return (
    <>
      <H>Reading the campus map</H>
      <P>The map is a scale layout of campus: colored blocks are buildings and rooms, and everything else (walls, gates, trees, extinguishers) is drawn on top. Hover or tap a sensor 📡 or extinguisher 🧯 to see its details.</P>
      <Step n={1}>Find your building. Medina Lacson, COAS and CAHS are the three with labeled rooms and sensors.</Step>
      <Step n={2}>Find the <strong>green dashed line</strong> leaving your building. It always shows the way from your building to its assembly area — you can learn it before an emergency.</Step>
      <Step n={3}>The line stops at the edge of the assembly area (Zone 2 or Zone 3). You do not need to walk to the middle — once you are inside the dashed green box, you have arrived.</Step>
      <MapLegend />
      <P style={{ marginTop: 12 }}>The key under the map shows the same symbols, so you don't need to reopen this guide while looking at it.</P>
    </>
  )
}

function Alerts() {
  return (
    <>
      <H>Alerts and evacuation</H>
      <Step n={1}><strong>🟠 Orange</strong> — a possible small fire was detected. Stay alert; responders are asked to check it.</Step>
      <Step n={2}><strong>🔴 Red</strong> — critical. Evacuate immediately to your assembly area.</Step>
      <Step n={3}>When an alert is active, a card appears at the top of the page with two tabs: <strong>Evacuating</strong> (what to do if you're leaving) and <strong>Responding</strong> (what to do if you accepted the response request).</Step>
      <Step n={4}>The card also lists the 3 nearest available fire extinguishers, with what each one is safe to use on. Extinguishers under Maintenance or Expired are never suggested.</Step>
      <Step n={5}>On the Campus Map, the <strong>red line</strong> shows the walk from the alerting room to the assembly area. That assembly area glows green, and the recommended extinguishers pulse green.</Step>
    </>
  )
}

function AdminTools() {
  return (
    <>
      <H>Admin tools</H>
      <Step n={1}><strong>Devices</strong> — register each sensor's building/floor/room and see its live status (Online / Offline / Maintenance).</Step>
      <Step n={2}><strong>Incident Log</strong> — every past alert, who responded (with their role), and export as CSV / TXT / PDF / Word.</Step>
      <Step n={3}><strong>User Accounts</strong> — change a person's role or remove an account. They see the change within a few seconds, no re-login needed.</Step>
      <Step n={4}><strong>Extinguishers</strong> — add, edit, or retire one (Active / Maintenance / Expired). Its status controls whether it's ever recommended during an alert.</Step>
      <P>Most admin pages have the same pattern: a table with an <strong>Edit</strong>/<strong>Delete</strong> action per row, and an <strong>Add</strong> button top-right.</P>
    </>
  )
}
