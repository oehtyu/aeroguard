'use client'

import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────
// Live guidance for an active Orange/Red alert.
//
// Two audiences, one card:
//   • Evacuating  — everyone who is not fighting the fire
//   • Responding  — people who tapped "I Can Respond"
// The tab opens on the one that fits the viewer; either can be opened.
//
// NOTE: this is general fire-safety guidance. Have BPSU DRRM / the
// local BFP review the wording before relying on it in a real drill.
// ─────────────────────────────────────────────────────────────

export type GuidanceProps = {
  level: 'Orange' | 'Red'
  location: string            // e.g. "CAHS Building, 1F, Room 104"
  building?: string
  floor?: string
  assemblyArea?: string | null
  extinguishers: any[]        // equipment rows already filtered to the affected building
  isResponder: boolean        // this user accepted the response request
  onRespond?: () => void      // opens the "Can you respond?" prompt
}

const EXT_USE: Record<string, { good: string; avoid: string }> = {
  ABC:   { good: 'Paper, wood, cloth, flammable liquids, live electrical', avoid: 'Cooking oil / kitchen grease fires' },
  CO2:   { good: 'Electrical equipment, computers, flammable liquids',     avoid: 'Paper/wood/cloth fires (fire can re-ignite)' },
  Water: { good: 'Paper, wood, cloth ONLY',                                 avoid: 'Electrical equipment, flammable liquids, grease' },
  Foam:  { good: 'Flammable liquids, paper, wood, cloth',                   avoid: 'Live electrical equipment' },
}

const card: React.CSSProperties = { background: 'var(--panel)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }
const stepNum: React.CSSProperties = {
  flex: '0 0 22px', height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
  fontSize: '.7rem', fontWeight: 700, fontFamily: 'var(--mono)',
}

function Steps({ items, color }: { items: { t: string; d?: string }[]; color: string }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
      {items.map((s, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ ...stepNum, background: `${color}22`, color, border: `1px solid ${color}55` }}>{i + 1}</span>
          <span style={{ fontSize: '.8rem', lineHeight: 1.45 }}>
            <strong>{s.t}</strong>{s.d ? <span style={{ color: 'var(--muted)' }}> — {s.d}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Note({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: '.76rem', lineHeight: 1.45,
                  background: `${color}12`, border: `1px solid ${color}40` }}>
      {children}
    </div>
  )
}

export default function GuidanceCard({ level, location, building, floor, assemblyArea, extinguishers, isResponder, onRespond }: GuidanceProps) {
  const isRed = level === 'Red'
  const color = isRed ? '#ef4444' : '#f97316'
  const [tab, setTab] = useState<'evacuate' | 'respond'>(isResponder ? 'respond' : 'evacuate')
  const [open, setOpen] = useState(true)
  useEffect(() => { if (isResponder) setTab('respond') }, [isResponder])

  // Same-floor extinguishers first; only Active ones are safe to send people to.
  const byFloor = (a: any, b: any) => Number(b.floor === floor) - Number(a.floor === floor)
  const usable = extinguishers.filter(e => (e.status || 'Active') === 'Active').sort(byFloor)
  const unusable = extinguishers.filter(e => (e.status || 'Active') !== 'Active')
  const gather = assemblyArea ? `the ${assemblyArea} assembly area` : 'the nearest assembly area / open ground away from the building'

  const evacSteps: { t: string; d?: string }[] = isRed ? [
    { t: 'Leave now', d: 'walk briskly, do not run, do not push. Leave your belongings.' },
    { t: 'Alert people around you', d: 'shout "FIRE" as you go. Help anyone who needs assistance only if it is safe; otherwise tell Security/DRRM exactly where they are.' },
    { t: 'Check doors before opening', d: 'touch with the back of your hand. If hot, do not open it — use another exit.' },
    { t: 'Use the stairs, never the elevator', d: floor && floor !== '1F' ? `you are being alerted from ${floor}; take the nearest stairwell down.` : 'go straight to the nearest exit.' },
    { t: 'Stay low in smoke', d: 'cover your nose and mouth with cloth and keep close to the floor.' },
    { t: 'Close doors behind you', d: 'do not lock them. This slows the spread of fire and smoke.' },
    { t: `Go to ${gather}`, d: 'stay there. Do not go back inside for any reason.' },
    { t: 'Be counted', d: 'report to your teacher/adviser or DRRM personnel. Tell them right away if anyone is missing.' },
  ] : [
    { t: 'Stay calm and stay alert', d: 'a possible small fire was detected. Responders are being asked to assist.' },
    { t: `If you are in or near ${building || 'the affected area'}`, d: 'leave the room, move away from the smoke, and keep corridors and stairs clear.' },
    { t: 'If you are elsewhere', d: 'continue what you are doing, stay away from the affected area, and keep this page open.' },
    { t: 'Be ready to evacuate', d: `if this becomes a RED alert, follow the evacuation steps and head to ${gather}.` },
    { t: 'Follow Security/DRRM instructions', d: 'they will tell you if the area needs to be cleared.' },
  ]

  return (
    <div role="alert" style={{ ...card, border: `1px solid ${color}55` }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: `${color}14`,
                 border: 'none', borderBottom: open ? `1px solid ${color}33` : 'none', color: 'var(--text)', cursor: 'pointer',
                 fontFamily: 'var(--font)', textAlign: 'left' }}>
        <span style={{ fontSize: '1.1rem' }}>{isRed ? '🔴' : '🟠'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: '.7rem', fontWeight: 700, letterSpacing: 1, color }}>
            {isRed ? 'RED ALERT — EVACUATE' : 'ORANGE ALERT — POSSIBLE FIRE'}
          </span>
          <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600 }}>What to do now · 📍 {location}</span>
        </span>
        <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '14px 18px 18px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {([['evacuate', '🚶 Evacuating'], ['respond', '🧯 Responding']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                         background: tab === id ? `${color}22` : 'transparent', color: tab === id ? color : 'var(--muted)',
                         border: `1px solid ${tab === id ? color : 'var(--border)'}` }}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'evacuate' && (
            <>
              <Steps items={evacSteps} color={color} />
              {isRed && (
                <Note color={color}>
                  <strong>Trapped?</strong> Stay in the room, close the door, seal the gaps with cloth, signal from a window, and call <strong>911</strong> with your exact location.
                </Note>
              )}
            </>
          )}

          {tab === 'respond' && (
            <>
              {isRed ? (
                <>
                  <Note color={color}>
                    <strong>Critical fire — do not try to put it out.</strong> Responders help people leave, keep everyone out of the building, and hand over to the Bureau of Fire Protection (BFP).
                  </Note>
                  <div style={{ height: 12 }} />
                  <Steps color={color} items={[
                    { t: 'Help clear the area', d: 'direct people to the exits and stairs. Only check rooms that are not filled with smoke. Never enter smoke or heat.' },
                    { t: 'Assist those who need help', d: 'injured, persons with disabilities, anyone unable to use the stairs — stay with them and report their location.' },
                    { t: `Move everyone to ${gather}`, d: 'keep the crowd well away from the building and clear of the fire-truck access.' },
                    { t: 'Do a headcount', d: 'compare against class lists/attendance and report anyone unaccounted for.' },
                    { t: 'Brief the BFP on arrival', d: 'exact location, what is burning, anyone missing, and hazards (lab chemicals, LPG, electrical rooms).' },
                    { t: 'Do not re-enter', d: 'wait for the BFP to declare the building safe.' },
                    { t: 'Submit your incident report', d: 'record what you did and when, while it is fresh.' },
                  ]} />
                </>
              ) : (
                <>
                  <Steps color={color} items={[
                    { t: 'Tell Security/DRRM you are responding', d: `and confirm the location: ${location}.` },
                    { t: 'Check the fire from a safe distance', d: 'if it is bigger than a small wastebasket, or spreading, do not fight it — treat it as a RED alert and evacuate people.' },
                    { t: 'Fight the fire ONLY if all of these are true', d: 'you are trained; the fire is small and contained; you have a clear exit behind you; there is little smoke; and you have the right extinguisher.' },
                    { t: 'Use PASS', d: 'Pull the pin · Aim at the base of the fire · Squeeze the handle · Sweep side to side. Stay about 2–3 m away.' },
                    { t: 'Back out if it is not working', d: 'fire growing, heavy smoke, or the extinguisher runs empty. Close the door and evacuate.' },
                    { t: 'Stay until it is confirmed out', d: 'watch for re-ignition and do not leave it unattended.' },
                    { t: 'Report the extinguisher you used', d: 'tell an Admin so it can be marked "Maintenance" and refilled.' },
                    { t: 'Submit your incident report', d: 'record what you did and when, while it is fresh.' },
                  ]} />

                  <div style={{ marginTop: 16, fontSize: '.7rem', fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    🧯 Extinguishers in {building || 'this building'}
                  </div>
                  {usable.length > 0 ? (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      {usable.map(e => {
                        const use = EXT_USE[e.equipment_type] || EXT_USE.ABC
                        return (
                          <div key={e.equipment_id} style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--panel2)', border: '1px solid var(--border)', fontSize: '.76rem' }}>
                            <div style={{ fontWeight: 600 }}>
                              {e.equipment_type} · {e.floor} — {e.location_description}
                              {e.floor === floor && <span style={{ marginLeft: 8, color: '#22c55e', fontSize: '.68rem' }}>● same floor as the alert</span>}
                            </div>
                            <div style={{ color: 'var(--muted)', marginTop: 2 }}>Use on: {use.good}. Do not use on: {use.avoid}.</div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <Note color="#ef4444">
                      <strong>No working extinguisher is registered for this building.</strong> Do not fight the fire — help people evacuate and wait for the BFP.
                    </Note>
                  )}
                  {unusable.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: '.72rem', color: 'var(--muted)' }}>
                      ⚠ Do not rely on: {unusable.map(e => `${e.equipment_type} at ${e.floor} — ${e.location_description} (${e.status})`).join('; ')}.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!isResponder && onRespond && (
            <div style={{ marginTop: 14 }}>
              <button onClick={onRespond}
                style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${color}`, background: 'transparent', color, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                I can respond or assist
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
