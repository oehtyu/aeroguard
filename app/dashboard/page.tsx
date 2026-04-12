'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── CONSTANTS ─────────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 15 * 60 * 1000   // 15 minutes idle = auto logout
const SESSION_KEY     = 'ag_user'
const LAST_ACTIVE_KEY = 'ag_last_active'

// ── BUILDINGS & DEVICES MAP DATA ──────────────────────────────
const BUILDINGS = [
  {
    id: 'medina',
    name: 'Medina Lacson Building',
    x: 80, y: 120, w: 200, h: 140,
    color: '#1e3a5f',
    rooms: [
      { id:'R201', label:'201', x:90,  y:130, w:55, h:45 },
      { id:'R202', label:'202', x:150, y:130, w:55, h:45 },
      { id:'R203', label:'203', x:210, y:130, w:60, h:45 },
      { id:'R101', label:'101', x:90,  y:185, w:55, h:65 },
      { id:'R102', label:'102', x:150, y:185, w:55, h:65 },
      { id:'R103', label:'103', x:210, y:185, w:60, h:65 },
    ]
  },
  {
    id: 'cea',
    name: 'New CEA Building',
    x: 360, y: 80, w: 220, h: 160,
    color: '#1a3a2f',
    rooms: [
      { id:'R101b', label:'101', x:370, y:90,  w:60, h:60 },
      { id:'R102b', label:'102', x:435, y:90,  w:60, h:60 },
      { id:'R103b', label:'103', x:500, y:90,  w:70, h:60 },
      { id:'R201b', label:'201', x:370, y:160, w:60, h:70 },
      { id:'R204b', label:'204', x:435, y:160, w:60, h:70 },
      { id:'R205b', label:'205', x:500, y:160, w:70, h:70 },
    ]
  },
  {
    id: 'cahs',
    name: 'CAHS Building',
    x: 120, y: 340, w: 200, h: 150,
    color: '#3a1a2f',
    rooms: [
      { id:'R103c', label:'103', x:130, y:350, w:60, h:60 },
      { id:'R104c', label:'104', x:195, y:350, w:60, h:60 },
      { id:'R105c', label:'105', x:260, y:350, w:50, h:60 },
      { id:'R202c', label:'202', x:130, y:420, w:60, h:60 },
      { id:'R203c', label:'203', x:195, y:420, w:60, h:60 },
      { id:'R204c', label:'204', x:260, y:420, w:50, h:60 },
    ]
  },
]

// Fire extinguisher locations
const EXTINGUISHERS = [
  { id:'E1', type:'ABC', x:145, y:178, building:'Medina Lacson Building', floor:'2F', desc:'Hallway Rooms 201-202' },
  { id:'E2', type:'ABC', x:145, y:250, building:'Medina Lacson Building', floor:'1F', desc:'Near main staircase' },
  { id:'E3', type:'ABC', x:415, y:155, building:'New CEA Building',       floor:'1F', desc:'Hallway near Room 101' },
  { id:'E4', type:'CO2', x:480, y:155, building:'New CEA Building',       floor:'1F', desc:'Laboratory near Room 103' },
  { id:'E5', type:'ABC', x:480, y:235, building:'New CEA Building',       floor:'2F', desc:'Hallway Rooms 204-205' },
  { id:'E6', type:'ABC', x:195, y:415, building:'CAHS Building',          floor:'1F', desc:'Main hallway 103-104' },
  { id:'E7', type:'ABC', x:195, y:480, building:'CAHS Building',          floor:'2F', desc:'Hallway Rooms 201-202' },
  { id:'E8', type:'CO2', x:260, y:480, building:'CAHS Building',          floor:'2F', desc:'Near nursing lab Room 203' },
]

// Evacuation assembly area
const ASSEMBLY = { x: 580, y: 340, w: 100, h: 60, label: 'Assembly Area' }

// ── HELPER FUNCTIONS ──────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  badge: { display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:4, fontSize:'.7rem', fontWeight:600, fontFamily:'var(--mono)', textTransform:'uppercase' as const, letterSpacing:'.5px' },
}

function Badge({ status }: { status: string }) {
  const map: Record<string, React.CSSProperties> = {
    Online:  { background:'rgba(34,197,94,.12)',  color:'var(--green)',  border:'1px solid rgba(34,197,94,.25)' },
    Offline: { background:'rgba(239,68,68,.12)',  color:'var(--red)',    border:'1px solid rgba(239,68,68,.25)' },
    Maintenance: { background:'rgba(234,179,8,.12)', color:'var(--yellow)', border:'1px solid rgba(234,179,8,.25)' },
    Active:  { background:'rgba(34,197,94,.12)',  color:'var(--green)',  border:'1px solid rgba(34,197,94,.25)' },
    Expired: { background:'rgba(239,68,68,.12)',  color:'var(--red)',    border:'1px solid rgba(239,68,68,.25)' },
  }
  return <span style={{...S.badge, ...(map[status] || map.Maintenance)}}>{status}</span>
}

function ThreatBadge({ level }: { level: string }) {
  const map: Record<string, React.CSSProperties> = {
    Gray:   { background:'rgba(148,163,184,.12)', color:'#94a3b8', border:'1px solid rgba(148,163,184,.25)' },
    Yellow: { background:'rgba(234,179,8,.12)',   color:'var(--yellow)', border:'1px solid rgba(234,179,8,.3)' },
    Orange: { background:'rgba(249,115,22,.15)',  color:'var(--orange)', border:'1px solid rgba(249,115,22,.3)' },
    Red:    { background:'rgba(239,68,68,.15)',   color:'var(--red)',    border:'1px solid rgba(239,68,68,.35)' },
  }
  const icons: Record<string,string> = { Gray:'⬜', Yellow:'🟡', Orange:'🟠', Red:'🔴' }
  return <span style={{...S.badge, ...(map[level] || map.Gray)}}>{icons[level]} {level}</span>
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string,string> = { Admin:'var(--accent)', Security:'var(--green)', DRRM:'var(--orange)', 'Campus Personnel':'var(--muted)' }
  return <span style={{ color: colors[role] || 'var(--muted)', fontWeight:600 }}>{role}</span>
}

function initials(name: string) { return name.split(' ').map((p:string)=>p[0]).join('').slice(0,2).toUpperCase() }
function pmColor(v: number) { if(v<35) return 'var(--green)'; if(v<150) return 'var(--yellow)'; if(v<300) return 'var(--orange)'; return 'var(--red)' }
function fmtTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-PH',{month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})
}
function timeAgo(ts: string) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000
  if(s<60) return `${Math.floor(s)}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`; return `${Math.floor(s/3600)}h ago`
}

// Map device to building room position
function getDeviceMapPos(deviceId: string): { x:number, y:number } | null {
  const map: Record<string, {x:number,y:number}> = {
    'AG-001': { x:117, y:152 },
    'AG-002': { x:177, y:152 },
    'AG-003': { x:237, y:152 },
    'AG-004': { x:400, y:120 },
    'AG-005': { x:465, y:120 },
    'AG-006': { x:465, y:195 },
    'AG-007': { x:160, y:380 },
    'AG-008': { x:225, y:450 },
  }
  return map[deviceId] || null
}

// ── CAMPUS MAP COMPONENT ──────────────────────────────────────
function CampusMap({ devices, incidents }: { devices: any[], incidents: any[] }) {
  const [tooltip, setTooltip] = useState<any>(null)

  const threatColor: Record<string,string> = {
    Gray: '#94a3b8', Yellow: '#eab308', Orange: '#f97316', Red: '#ef4444'
  }

  const getDeviceThreat = (deviceId: string) => {
    const inc = incidents.find(i => i.device_id === deviceId && !i.resolved)
    return inc?.threat_level || 'Gray'
  }

  return (
    <div style={{ position:'relative', width:'100%' }}>
      <svg
        viewBox="0 0 720 560"
        style={{ width:'100%', height:'auto', background:'#0d1421', borderRadius:8, border:'1px solid var(--border)' }}
      >
        {/* Grid lines */}
        {Array.from({length:18}).map((_,i)=>(
          <line key={`v${i}`} x1={i*40} y1={0} x2={i*40} y2={560} stroke="rgba(255,255,255,0.03)" strokeWidth={1}/>
        ))}
        {Array.from({length:14}).map((_,i)=>(
          <line key={`h${i}`} x1={0} y1={i*40} x2={720} y2={i*40} stroke="rgba(255,255,255,0.03)" strokeWidth={1}/>
        ))}

        {/* Roads / pathways */}
        <rect x={310} y={0}   width={40} height={560} fill="rgba(255,255,255,0.04)" rx={2}/>
        <rect x={0}   y={290} width={720} height={40} fill="rgba(255,255,255,0.04)" rx={2}/>
        <text x={325} y={275} fill="rgba(255,255,255,0.15)" fontSize={8} textAnchor="middle" fontFamily="monospace">ROAD</text>

        {/* Buildings */}
        {BUILDINGS.map(b => (
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} rx={4} stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>
            {/* Building label */}
            <text x={b.x + b.w/2} y={b.y - 6} fill="rgba(255,255,255,0.5)" fontSize={7} textAnchor="middle" fontFamily="monospace">
              {b.name.toUpperCase()}
            </text>
            {/* Rooms */}
            {b.rooms.map(r => (
              <g key={r.id}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.04)" rx={2} stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>
                <text x={r.x+r.w/2} y={r.y+r.h/2+3} fill="rgba(255,255,255,0.25)" fontSize={7} textAnchor="middle" fontFamily="monospace">{r.label}</text>
              </g>
            ))}
          </g>
        ))}

        {/* Assembly area */}
        <rect x={ASSEMBLY.x} y={ASSEMBLY.y} width={ASSEMBLY.w} height={ASSEMBLY.h} fill="rgba(34,197,94,0.1)" rx={6} stroke="rgba(34,197,94,0.4)" strokeWidth={1.5} strokeDasharray="4 3"/>
        <text x={ASSEMBLY.x+ASSEMBLY.w/2} y={ASSEMBLY.y+ASSEMBLY.h/2-4} fill="#22c55e" fontSize={7} textAnchor="middle" fontFamily="monospace" fontWeight="bold">ASSEMBLY</text>
        <text x={ASSEMBLY.x+ASSEMBLY.w/2} y={ASSEMBLY.y+ASSEMBLY.h/2+8} fill="#22c55e" fontSize={7} textAnchor="middle" fontFamily="monospace">AREA</text>

        {/* Evacuation arrows — shown when there's an active Orange/Red alert */}
        {incidents.filter(i=>!i.resolved && (i.threat_level==='Orange'||i.threat_level==='Red')).slice(0,1).map(inc => {
          const pos = getDeviceMapPos(inc.device_id)
          if(!pos) return null
          return (
            <g key={`evac-${inc.incident_id}`}>
              <line x1={pos.x} y1={pos.y} x2={ASSEMBLY.x} y2={ASSEMBLY.y+ASSEMBLY.h/2}
                stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6}/>
              <polygon points={`${ASSEMBLY.x},${ASSEMBLY.y+ASSEMBLY.h/2} ${ASSEMBLY.x-8},${ASSEMBLY.y+ASSEMBLY.h/2-5} ${ASSEMBLY.x-8},${ASSEMBLY.y+ASSEMBLY.h/2+5}`}
                fill="#22c55e" opacity={0.6}/>
              <text x={(pos.x+ASSEMBLY.x)/2} y={(pos.y+ASSEMBLY.y+ASSEMBLY.h/2)/2-6}
                fill="#22c55e" fontSize={7} textAnchor="middle" fontFamily="monospace" opacity={0.8}>EVACUATION ROUTE</text>
            </g>
          )
        })}

        {/* Fire extinguishers */}
        {EXTINGUISHERS.map(e => (
          <g key={e.id}
            style={{ cursor:'pointer' }}
            onMouseEnter={() => setTooltip({ type:'ext', data:e, x:e.x, y:e.y })}
            onMouseLeave={() => setTooltip(null)}
          >
            <circle cx={e.x} cy={e.y} r={6} fill="rgba(249,115,22,0.2)" stroke="#f97316" strokeWidth={1}/>
            <text x={e.x} y={e.y+4} textAnchor="middle" fontSize={7} fill="#f97316" fontWeight="bold">🧯</text>
          </g>
        ))}

        {/* AeroGuard device markers */}
        {devices.map(d => {
          const pos = getDeviceMapPos(d.device_id)
          if(!pos) return null
          const threat = getDeviceThreat(d.device_id)
          const color  = threatColor[threat] || '#94a3b8'
          const isActive = threat !== 'Gray'
          return (
            <g key={d.device_id}
              style={{ cursor:'pointer' }}
              onMouseEnter={() => setTooltip({ type:'device', data:d, threat, x:pos.x, y:pos.y })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Pulse ring for active threats */}
              {isActive && (
                <circle cx={pos.x} cy={pos.y} r={14} fill="none" stroke={color} strokeWidth={1} opacity={0.4}>
                  <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={pos.x} cy={pos.y} r={8} fill={color} opacity={d.status==='Online'?0.9:0.3}/>
              <circle cx={pos.x} cy={pos.y} r={8} fill="none" stroke="white" strokeWidth={1} opacity={0.5}/>
              <text x={pos.x} y={pos.y+4} textAnchor="middle" fontSize={7} fill="white" fontWeight="bold">📡</text>
              {/* Device ID label */}
              <text x={pos.x} y={pos.y+18} textAnchor="middle" fontSize={6} fill="rgba(255,255,255,0.6)" fontFamily="monospace">{d.device_id}</text>
            </g>
          )
        })}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x > 500 ? tooltip.x - 145 : tooltip.x + 12}
              y={tooltip.y > 400 ? tooltip.y - 80  : tooltip.y + 12}
              width={140} height={tooltip.type==='device'?75:65}
              fill="#111827" rx={4} stroke="rgba(255,255,255,0.15)" strokeWidth={1}
            />
            {tooltip.type === 'device' ? (
              <>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-62 : tooltip.y+26} fill="white" fontSize={8} fontWeight="bold" fontFamily="monospace">{tooltip.data.device_id}</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-50 : tooltip.y+38} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tooltip.data.device_name}</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-38 : tooltip.y+50} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tooltip.data.floor} · {tooltip.data.room}</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-26 : tooltip.y+62} fill={tooltip.data.status==='Online'?'#22c55e':'#ef4444'} fontSize={7} fontFamily="monospace">● {tooltip.data.status}</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-14 : tooltip.y+74} fill={({Gray:'#94a3b8',Yellow:'#eab308',Orange:'#f97316',Red:'#ef4444'} as any)[tooltip.threat]||'#94a3b8'} fontSize={7} fontFamily="monospace">⚠ {tooltip.threat} Level</text>
              </>
            ) : (
              <>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-62 : tooltip.y+26} fill="#f97316" fontSize={8} fontWeight="bold" fontFamily="monospace">🧯 {tooltip.data.type} Extinguisher</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-50 : tooltip.y+38} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tooltip.data.building.split(' ')[0]}</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-38 : tooltip.y+50} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tooltip.data.floor} — {tooltip.data.desc}</text>
                <text x={tooltip.x > 500 ? tooltip.x-137 : tooltip.x+18} y={tooltip.y > 400 ? tooltip.y-26 : tooltip.y+62} fill="#22c55e" fontSize={7} fontFamily="monospace">● Active</text>
              </>
            )}
          </g>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display:'flex', gap:16, marginTop:10, flexWrap:'wrap', fontSize:'.7rem', color:'var(--muted)', fontFamily:'var(--mono)' }}>
        {[
          { color:'#94a3b8', label:'Gray — Safe' },
          { color:'#eab308', label:'Yellow — Vaping' },
          { color:'#f97316', label:'Orange — Small Fire' },
          { color:'#ef4444', label:'Red — Critical' },
        ].map(l=>(
          <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:l.color }}/>
            {l.label}
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span>🧯</span> Fire Extinguisher
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:10, height:10, borderRadius:2, background:'rgba(34,197,94,0.15)', border:'1px solid #22c55e' }}/>
          Assembly Area
        </div>
      </div>
    </div>
  )
}

// ── MAIN DASHBOARD ────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const [user, setUser]           = useState<any>(null)
  const [view, setView]           = useState('dashboard')
  const [devices, setDevices]     = useState<any[]>([])
  const [incidents, setIncidents] = useState<any[]>([])
  const [users, setUsers]         = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const [clock, setClock]         = useState('')
  const [toast, setToast]         = useState<any>(null)
  const [modal, setModal]         = useState<string|null>(null)
  const [form, setForm]           = useState<any>({})
  const [editId, setEditId]       = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [incidentFilter, setIncidentFilter] = useState('')
  const [userSearch, setUserSearch]   = useState('')
  const [deviceSearch, setDeviceSearch] = useState('')
  const [idleWarning, setIdleWarning]   = useState(false)
  const idleTimer   = useRef<any>(null)
  const warningTimer = useRef<any>(null)

  const isAdmin = user?.user_type === 'Admin'

  // ── AUTO LOGOUT ON IDLE ────────────────────────────────────
  const resetIdle = () => {
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())
    setIdleWarning(false)
    clearTimeout(idleTimer.current)
    clearTimeout(warningTimer.current)

    // Warn at 13 minutes
    warningTimer.current = setTimeout(() => {
      setIdleWarning(true)
    }, IDLE_TIMEOUT_MS - 2 * 60 * 1000)

    // Logout at 15 minutes
    idleTimer.current = setTimeout(() => {
      doLogout(true)
    }, IDLE_TIMEOUT_MS)
  }

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) { router.push('/login'); return }

    // Check if session expired (tab was closed and reopened after timeout)
    const lastActive = localStorage.getItem(LAST_ACTIVE_KEY)
    if (lastActive && Date.now() - parseInt(lastActive) > IDLE_TIMEOUT_MS) {
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(LAST_ACTIVE_KEY)
      router.push('/login')
      return
    }

    setUser(JSON.parse(stored))
    loadDevices(); loadIncidents()

    // Clock
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-PH')), 1000)
    // Data refresh
    const r = setInterval(() => { loadDevices(); loadIncidents() }, 30000)

    // Idle detection — listen to user activity
    const events = ['mousedown','mousemove','keydown','scroll','touchstart','click']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive:true }))
    resetIdle() // start the timer

    return () => {
      clearInterval(t); clearInterval(r)
      clearTimeout(idleTimer.current); clearTimeout(warningTimer.current)
      events.forEach(e => window.removeEventListener(e, resetIdle))
    }
  }, [])

  function showToast(type: string, title: string, msg: string) {
    setToast({ type, title, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function apiFetch(url: string, method = 'GET', body?: any) {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
    return res.json()
  }

  const loadDevices   = async () => { const d = await apiFetch('/api/devices');   if(d.success) setDevices(d.data) }
  const loadIncidents = async (level='') => { const d = await apiFetch(`/api/incidents${level?`?level=${level}`:''}`); if(d.success) setIncidents(d.data) }
  const loadUsers     = async () => { const d = await apiFetch('/api/users');     if(d.success) setUsers(d.data) }
  const loadEquipment = async () => { const d = await apiFetch('/api/equipment'); if(d.success) setEquipment(d.data) }

  function switchView(v: string) {
    setView(v)
    if(v==='users') loadUsers()
    if(v==='equipment') loadEquipment()
    if(v==='devices') loadDevices()
    if(v==='incidents') loadIncidents()
  }

  function guardedView(v: string) {
    if(!isAdmin) { setModal('access'); return }
    switchView(v)
  }

  function doLogout(auto = false) {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(LAST_ACTIVE_KEY)
    if(auto) showToast('info','Session Expired','You were logged out due to inactivity.')
    router.push('/login')
  }

  function logout() { doLogout(false) }

  // ── SAVE USER ──
  async function saveUser() {
    const method = editId ? 'PUT' : 'POST'
    const d = await apiFetch('/api/users', method, { ...form, user_id: editId })
    if(!d.success) { showToast('error','Error',d.message); return }
    showToast('success', editId?'User Updated':'User Added', form.full_name+' saved.')
    setModal(null); loadUsers()
  }

  // ── SAVE DEVICE ──
  async function saveDevice() {
    const method = editId ? 'PUT' : 'POST'
    const d = await apiFetch('/api/devices', method, { ...form, device_id: form.device_id?.toUpperCase() })
    if(!d.success) { showToast('error','Error',d.message); return }
    showToast('success', editId?'Device Updated':'Device Added', 'Saved.')
    setModal(null); loadDevices()
  }

  // ── SAVE EQUIPMENT ──
  async function saveEquipment() {
    const d = await apiFetch('/api/equipment', 'POST', form)
    if(!d.success) { showToast('error','Error',d.message); return }
    showToast('success','Equipment Added','Saved.'); setModal(null); loadEquipment()
  }

  // ── DELETE ──
  async function confirmDelete() {
    if(!deleteTarget) return
    const urls: Record<string,string> = { user:'/api/users', device:'/api/devices', equipment:'/api/equipment' }
    const keys: Record<string,string> = { user:'user_id', device:'device_id', equipment:'equipment_id' }
    const d = await apiFetch(urls[deleteTarget.type], 'DELETE', { [keys[deleteTarget.type]]: deleteTarget.id })
    if(!d.success) { showToast('error','Error',d.message); return }
    showToast('success','Deleted','Record removed.')
    setModal(null); setDeleteTarget(null)
    if(deleteTarget.type==='user') loadUsers()
    if(deleteTarget.type==='device') loadDevices()
    if(deleteTarget.type==='equipment') loadEquipment()
  }

  function exportCSV() {
    const rows = ['Time,Device,Location,Level,PM2.5,Status',
      ...incidents.map(i=>`"${fmtTime(i.created_at)}","${i.device_id}","${i.location}","${i.threat_level}","${i.pm25_value}","${i.resolved?'Resolved':'Active'}"`)
    ]
    const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'})),download:'incidents.csv'})
    a.click(); showToast('success','Exported','CSV downloaded.')
  }

  // Stats
  const online      = devices.filter(d=>d.status==='Online').length
  const activeAlerts = new Set(incidents.filter(i=>i.threat_level!=='Gray'&&!i.resolved).map(i=>i.device_id)).size
  const todayInc    = incidents.filter(i=>new Date(i.created_at)>new Date(Date.now()-86400000)).length
  const redInc      = incidents.find(i=>i.threat_level==='Red'&&!i.resolved)

  const navItems = [
    { id:'dashboard', icon:'📊', label:'Dashboard',    section:'Monitor' },
    { id:'map',       icon:'🗺️',  label:'Campus Map',   section:'' },
    { id:'incidents', icon:'🔔', label:'Incident Log', section:'' },
    { id:'users',     icon:'👥', label:'User Accounts', section:'Manage', admin:true },
    { id:'devices',   icon:'📡', label:'Devices',       section:'', admin:true },
    { id:'equipment', icon:'🧯', label:'Fire Equipment',section:'', admin:true },
  ]

  const chip: Record<string,string> = {
    Admin:'rgba(0,194,255,.12)|var(--accent)|rgba(0,194,255,.25)',
    Security:'rgba(34,197,94,.12)|var(--green)|rgba(34,197,94,.25)',
    DRRM:'rgba(249,115,22,.12)|var(--orange)|rgba(249,115,22,.25)',
    'Campus Personnel':'rgba(148,163,184,.1)|var(--gray)|rgba(148,163,184,.2)'
  }

  if (!user) return null

  const [chipBg, chipColor, chipBorder] = (chip[user.user_type]||chip['Campus Personnel']).split('|')

  const viewTitles: Record<string,string> = {
    dashboard:'System Dashboard', map:'Campus Map', incidents:'Incident Log',
    users:'User Accounts', devices:'Device Management', equipment:'Fire Equipment'
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'var(--font)' }}>

      {/* ── IDLE WARNING BANNER ── */}
      {idleWarning && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, zIndex:9999,
          background:'rgba(234,179,8,0.95)', color:'#000',
          padding:'10px 24px', display:'flex', alignItems:'center', justifyContent:'space-between',
          fontSize:'.85rem', fontWeight:600
        }}>
          <span>⚠️ You'll be logged out in 2 minutes due to inactivity.</span>
          <button onClick={resetIdle} style={{ background:'#000', color:'#eab308', border:'none', borderRadius:6, padding:'4px 14px', cursor:'pointer', fontWeight:700, fontSize:'.8rem' }}>
            Stay Logged In
          </button>
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{ width:240, background:'var(--panel)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, bottom:0, zIndex:100 }}>
        <div style={{ padding:'20px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, background:'linear-gradient(135deg,#0072ff,#00c2ff)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🛡️</div>
          <div>
            <div style={{ fontSize:'1.1rem', fontWeight:700 }}>AeroGuard</div>
            <div style={{ fontSize:'.65rem', color:'var(--muted)', fontFamily:'var(--mono)', letterSpacing:1, textTransform:'uppercase' }}>BPSU Fire Safety</div>
          </div>
        </div>

        <nav style={{ padding:'12px 0', flex:1 }}>
          {navItems.map((item) => (
            <div key={item.id}>
              {item.section && <div style={{ padding:'10px 22px 4px', fontSize:'.65rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:2, fontFamily:'var(--mono)' }}>{item.section}</div>}
              <div
                onClick={() => item.admin ? guardedView(item.id) : switchView(item.id)}
                style={{
                  padding:'10px 22px', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
                  fontSize:'.875rem', color: view===item.id ? 'var(--accent)' : 'var(--gray)',
                  borderLeft: view===item.id ? '2px solid var(--accent)' : '2px solid transparent',
                  background: view===item.id ? 'rgba(0,194,255,.08)' : 'transparent',
                  transition:'all .15s'
                }}
              >
                <span>{item.icon}</span> {item.label}
                {item.admin && !isAdmin && <span style={{ fontSize:'.6rem', marginLeft:'auto', color:'var(--muted)' }}>🔒</span>}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ padding:'16px 22px', borderTop:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--panel2)', borderRadius:8, marginBottom:10 }}>
            <div style={{ width:30, height:30, background:'linear-gradient(135deg,#0072ff,#00c2ff)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 }}>{initials(user.full_name)}</div>
            <div>
              <div style={{ fontSize:'.8rem', fontWeight:500 }}>{user.full_name}</div>
              <div style={{ fontSize:'.65rem', color:'var(--muted)' }}>{user.user_type}</div>
            </div>
          </div>
          <button onClick={logout} style={{ width:'100%', padding:8, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', borderRadius:6, color:'var(--red)', fontSize:'.78rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>🚪 &nbsp;Sign Out</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ marginLeft:240, flex:1, display:'flex', flexDirection:'column' }}>

        {/* TOPBAR */}
        <div style={{ padding:'14px 28px', background:'var(--panel)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
          <div>
            <div style={{ fontSize:'1.05rem', fontWeight:600 }}>{viewTitles[view]}</div>
            <div style={{ fontSize:'.75rem', color:'var(--muted)', fontFamily:'var(--mono)' }}>AeroGuard / {view}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontSize:'.68rem', padding:'3px 10px', borderRadius:20, fontFamily:'var(--mono)', fontWeight:600, textTransform:'uppercase', background:chipBg, color:chipColor, border:`1px solid ${chipBorder}` }}>{user.user_type}</span>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.75rem', color:'var(--green)', fontFamily:'var(--mono)' }}>
              <div style={{ width:8, height:8, background:'var(--green)', borderRadius:'50%' }} /> SYSTEM LIVE
            </div>
            <div style={{ fontSize:'.75rem', color:'var(--muted)', fontFamily:'var(--mono)' }}>{clock}</div>
          </div>
        </div>

        <div style={{ padding:'24px 28px', flex:1 }}>

          {/* RED ALERT BAR */}
          {redInc && (
            <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', borderRadius:8, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:16, fontSize:'.8rem', color:'var(--red)' }}>
              🚨 <strong>CRITICAL ALERT:</strong>&nbsp;Red level detected — {redInc.location}. Evacuation protocols active.
            </div>
          )}

          {/* ══ DASHBOARD VIEW ══ */}
          {view === 'dashboard' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
                {[
                  { label:'Total Devices', value:devices.length, color:'var(--accent)', top:'var(--accent)' },
                  { label:'Online', value:online, color:'var(--green)', top:'var(--green)' },
                  { label:'Active Alerts', value:activeAlerts, color:'var(--yellow)', top:'var(--yellow)' },
                  { label:'Incidents Today', value:todayInc, color:'var(--red)', top:'var(--red)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:s.top }} />
                    <div style={{ fontSize:'.7rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:8 }}>{s.label}</div>
                    <div style={{ fontSize:'2rem', fontWeight:700, fontFamily:'var(--mono)', color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:16 }}>
                <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:600, fontSize:'.875rem' }}>Smoke Detector Status</span>
                    <span style={{ fontSize:'.65rem', padding:'2px 8px', borderRadius:20, background:'rgba(0,194,255,.1)', color:'var(--accent)', border:'1px solid rgba(0,194,255,.2)', fontFamily:'var(--mono)' }}>LIVE</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr', padding:'8px 20px', color:'var(--muted)', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:1, fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)' }}>
                    <span>Device</span><span>Location</span><span>Status</span><span>Threat</span><span>PM2.5</span>
                  </div>
                  <div style={{ maxHeight:320, overflowY:'auto' }}>
                    {devices.map(d => {
                      const latest = incidents.find(i=>i.device_id===d.device_id)
                      const threat = latest?.threat_level || 'Gray'
                      const pm = parseFloat(latest?.pm25_value || '12.5')
                      return (
                        <div key={d.device_id} style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr', padding:'12px 20px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize:'.8rem' }}>
                          <div><div style={{ fontWeight:500 }}>{d.device_id}</div><div style={{ color:'var(--muted)', fontSize:'.75rem' }}>{d.device_name}</div></div>
                          <div><div style={{ fontSize:'.8rem' }}>{d.building}</div><div style={{ color:'var(--muted)', fontSize:'.75rem' }}>{d.floor} · {d.room}</div></div>
                          <div><Badge status={d.status} /></div>
                          <div><ThreatBadge level={threat} /></div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:'.78rem', color:pmColor(pm) }}>{d.status==='Online'?pm.toFixed(1)+' µg/m³':'—'}</div>
                        </div>
                      )
                    })}
                    {devices.length===0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No devices registered.</div>}
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}><span style={{ fontWeight:600, fontSize:'.875rem' }}>Recent Alerts</span></div>
                    <div style={{ maxHeight:200, overflowY:'auto' }}>
                      {incidents.slice(0,5).map(i => {
                        const dotColors: Record<string,string> = { Gray:'var(--gray)', Yellow:'var(--yellow)', Orange:'var(--orange)', Red:'var(--red)' }
                        return (
                          <div key={i.incident_id} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
                            <div style={{ width:8, height:8, borderRadius:'50%', background:dotColors[i.threat_level]||'var(--gray)', marginTop:4, flexShrink:0 }} />
                            <div>
                              <div style={{ fontSize:'.72rem', fontWeight:600, color:dotColors[i.threat_level] }}>{i.threat_level} — {i.device_id}</div>
                              <div style={{ fontSize:'.75rem' }}>{i.location}</div>
                              <div style={{ fontSize:'.68rem', color:'var(--muted)', fontFamily:'var(--mono)' }}>{timeAgo(i.created_at)}</div>
                            </div>
                          </div>
                        )
                      })}
                      {incidents.length===0 && <div style={{ padding:16, color:'var(--muted)', fontSize:'.8rem' }}>No recent alerts</div>}
                    </div>
                  </div>
                  <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}><span style={{ fontWeight:600, fontSize:'.875rem' }}>Live Sensor Readings</span></div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, padding:'14px 16px' }}>
                      {devices.filter(d=>d.status==='Online').slice(0,4).map(d => {
                        const latest = incidents.find(i=>i.device_id===d.device_id)
                        const pm = parseFloat(latest?.pm25_value || '12.5')
                        return (
                          <div key={d.device_id} style={{ background:'var(--panel2)', borderRadius:8, padding:'12px 14px', border:'1px solid var(--border)' }}>
                            <div style={{ fontSize:'.65rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>{d.device_id}</div>
                            <div style={{ fontSize:'1.4rem', fontWeight:700, fontFamily:'var(--mono)', color:pmColor(pm) }}>{pm.toFixed(1)}</div>
                            <div style={{ fontSize:'.65rem', color:'var(--muted)' }}>µg/m³ PM2.5</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ CAMPUS MAP VIEW ══ */}
          {view === 'map' && (
            <div>
              <div style={{ marginBottom:16, display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={{ fontSize:'.85rem', color:'var(--muted)', marginTop:4 }}>
                    Real-time device locations, threat levels, fire extinguishers, and evacuation routes.
                    Hover over markers for details.
                  </div>
                </div>
                {redInc && (
                  <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 16px', fontSize:'.8rem', color:'var(--red)', display:'flex', alignItems:'center', gap:8 }}>
                    🚨 <strong>Evacuation route shown</strong> — {redInc.location}
                  </div>
                )}
              </div>
              <CampusMap devices={devices} incidents={incidents} />

              {/* Active alerts summary */}
              {incidents.filter(i=>!i.resolved && i.threat_level !== 'Gray').length > 0 && (
                <div style={{ marginTop:16, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', fontSize:'.875rem', fontWeight:600 }}>Active Alerts on Map</div>
                  {incidents.filter(i=>!i.resolved && i.threat_level !== 'Gray').map(i=>(
                    <div key={i.incident_id} style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1fr 1fr', padding:'10px 20px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize:'.8rem' }}>
                      <div><ThreatBadge level={i.threat_level}/></div>
                      <div style={{ color:'var(--muted)' }}>{i.location}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:'.72rem' }}>{fmtTime(i.created_at)}</div>
                      <div style={{ color:'var(--muted)', fontSize:'.75rem' }}>
                        {(i.threat_level==='Orange'||i.threat_level==='Red') && '🧯 Check nearest extinguisher'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ INCIDENTS VIEW ══ */}
          {view === 'incidents' && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
                <select onChange={e=>{setIncidentFilter(e.target.value);loadIncidents(e.target.value)}} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', color:'var(--text)', fontFamily:'var(--font)', fontSize:'.82rem', width:160 }}>
                  <option value="">All Levels</option>
                  {['Gray','Yellow','Orange','Red'].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
                <div style={{ flex:1 }} />
                <button onClick={exportCSV} style={{ padding:'8px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:'.8rem', cursor:'pointer', fontFamily:'var(--font)' }}>⬇ Export CSV</button>
              </div>
              <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr', padding:'8px 20px', color:'var(--muted)', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:1, fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)' }}>
                  <span>Time</span><span>Device</span><span>Location</span><span>Level</span><span>PM2.5</span><span>Status</span>
                </div>
                {incidents.map(i=>(
                  <div key={i.incident_id} style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr', padding:'10px 20px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize:'.78rem' }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'.72rem' }}>{fmtTime(i.created_at)}</div>
                    <div>{i.device_id}</div>
                    <div style={{ color:'var(--muted)' }}>{i.location}</div>
                    <div><ThreatBadge level={i.threat_level} /></div>
                    <div style={{ fontFamily:'var(--mono)', color:pmColor(Number(i.pm25_value)) }}>{i.pm25_value} µg/m³</div>
                    <div><Badge status={i.resolved?'Active':'Maintenance'} /></div>
                  </div>
                ))}
                {incidents.length===0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No incidents found.</div>}
              </div>
            </div>
          )}

          {/* ══ USERS VIEW ══ */}
          {view === 'users' && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
                <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="🔍  Search users..." style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 14px', color:'var(--text)', fontSize:'.82rem', outline:'none', width:240 }} />
                <div style={{ flex:1 }} />
                <button onClick={()=>{setEditId(null);setForm({user_type:'Security'});setModal('user')}} style={{ padding:'8px 18px', background:'var(--accent2)', color:'white', border:'none', borderRadius:6, fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>+ Add User</button>
              </div>
              <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.5fr 1.2fr 1fr', padding:'8px 20px', color:'var(--muted)', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:1, fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)' }}>
                  <span>Name</span><span>Role</span><span>Email</span><span>Phone</span><span>Actions</span>
                </div>
                {users.filter(u=>!userSearch||u.full_name.toLowerCase().includes(userSearch.toLowerCase())||u.username.toLowerCase().includes(userSearch.toLowerCase())).map(u=>(
                  <div key={u.user_id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1.5fr 1.2fr 1fr', padding:'12px 20px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize:'.8rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, background:'linear-gradient(135deg,#0072ff,#00c2ff)', borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{initials(u.full_name)}</div>
                      <div><div style={{ fontWeight:500 }}>{u.full_name}</div><div style={{ color:'var(--muted)', fontSize:'.72rem', fontFamily:'var(--mono)' }}>@{u.username}</div></div>
                    </div>
                    <div><RoleBadge role={u.user_type} /></div>
                    <div style={{ color:'var(--muted)' }}>{u.email||'—'}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'.75rem' }}>{u.phone||'—'}</div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>{setEditId(u.user_id);setForm({full_name:u.full_name,username:u.username,user_type:u.user_type,email:u.email,phone:u.phone});setModal('user')}} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'.9rem', padding:'3px 6px', borderRadius:4 }}>✏️</button>
                      <button onClick={()=>{setDeleteTarget({type:'user',id:u.user_id,label:u.full_name});setModal('delete')}} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'.9rem', padding:'3px 6px', borderRadius:4 }}>🗑</button>
                    </div>
                  </div>
                ))}
                {users.length===0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No users found.</div>}
              </div>
            </div>
          )}

          {/* ══ DEVICES VIEW ══ */}
          {view === 'devices' && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
                <input value={deviceSearch} onChange={e=>setDeviceSearch(e.target.value)} placeholder="🔍  Search devices..." style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 14px', color:'var(--text)', fontSize:'.82rem', outline:'none', width:240 }} />
                <div style={{ flex:1 }} />
                <button onClick={()=>{setEditId(null);setForm({building:'Medina Lacson Building',floor:'1F',room:'Room 101',status:'Online'});setModal('device')}} style={{ padding:'8px 18px', background:'var(--accent2)', color:'white', border:'none', borderRadius:6, fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>+ Add Device</button>
              </div>
              <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr', padding:'8px 20px', color:'var(--muted)', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:1, fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)' }}>
                  <span>Device</span><span>Location</span><span>Status</span><span>Threat</span><span>Actions</span>
                </div>
                {devices.filter(d=>!deviceSearch||d.device_id.toLowerCase().includes(deviceSearch.toLowerCase())||d.building.toLowerCase().includes(deviceSearch.toLowerCase())).map(d=>{
                  const threat = incidents.find(i=>i.device_id===d.device_id)?.threat_level||'Gray'
                  return (
                    <div key={d.device_id} style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr', padding:'12px 20px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize:'.8rem' }}>
                      <div><div style={{ fontWeight:500 }}>{d.device_id}</div><div style={{ color:'var(--muted)', fontSize:'.75rem' }}>{d.device_name}</div></div>
                      <div><div>{d.building}</div><div style={{ color:'var(--muted)', fontSize:'.75rem' }}>{d.floor} · {d.room}</div></div>
                      <div><Badge status={d.status} /></div>
                      <div><ThreatBadge level={threat} /></div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={()=>{setEditId(d.device_id);setForm({device_id:d.device_id,device_name:d.device_name,building:d.building,floor:d.floor,room:d.room,status:d.status});setModal('device')}} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'.9rem' }}>✏️</button>
                        <button onClick={()=>{setDeleteTarget({type:'device',id:d.device_id,label:d.device_id});setModal('delete')}} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'.9rem' }}>🗑</button>
                      </div>
                    </div>
                  )
                })}
                {devices.length===0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No devices found.</div>}
              </div>
            </div>
          )}

          {/* ══ EQUIPMENT VIEW ══ */}
          {view === 'equipment' && (
            <div>
              <div style={{ display:'flex', marginBottom:16 }}>
                <div style={{ flex:1 }} />
                <button onClick={()=>{setForm({equipment_type:'ABC',building:'Medina Lacson Building',floor:'1F',status:'Active',last_inspection:new Date().toISOString().split('T')[0]});setModal('equipment')}} style={{ padding:'8px 18px', background:'var(--accent2)', color:'white', border:'none', borderRadius:6, fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>+ Add Equipment</button>
              </div>
              <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr', padding:'8px 20px', color:'var(--muted)', fontSize:'.65rem', textTransform:'uppercase', letterSpacing:1, fontFamily:'var(--mono)', borderBottom:'1px solid var(--border)' }}>
                  <span>Type</span><span>Building</span><span>Location</span><span>Last Inspection</span><span>Status</span>
                </div>
                {equipment.map(e=>(
                  <div key={e.equipment_id} style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr', padding:'12px 20px', borderBottom:'1px solid var(--border)', alignItems:'center', fontSize:'.8rem' }}>
                    <div style={{ fontWeight:600 }}>{e.equipment_type} <span style={{ fontSize:'.7rem', color:'var(--muted)', fontWeight:400 }}>Extinguisher</span></div>
                    <div>{e.building}</div>
                    <div style={{ color:'var(--muted)' }}>{e.floor} · {e.location_description||'—'}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'.75rem', color:'var(--muted)' }}>{e.last_inspection||'—'}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <Badge status={e.status} />
                      <button onClick={()=>{setDeleteTarget({type:'equipment',id:e.equipment_id,label:e.equipment_type});setModal('delete')}} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:'.9rem' }}>🗑</button>
                    </div>
                  </div>
                ))}
                {equipment.length===0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No equipment registered.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ MODALS ══ */}
      {modal && (
        <div onClick={e=>{if(e.target===e.currentTarget)setModal(null)}} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>

          {/* USER MODAL */}
          {modal === 'user' && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, width:480, maxWidth:'95vw', overflow:'hidden' }}>
              <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:'1rem', fontWeight:600 }}>{editId ? 'Edit User' : 'Add User'}</div>
                <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'1.2rem', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ padding:22 }}>
                {[
                  [{key:'full_name',label:'Full Name',ph:'Juan Dela Cruz'},{key:'username',label:'Username',ph:'jdelacruz'}],
                  [{key:'email',label:'Email',ph:'email@bpsu.edu.ph'},{key:'phone',label:'Phone',ph:'09XXXXXXXXX'}],
                ].map((row,i)=>(
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                    {row.map(f=>(
                      <div key={f.key}>
                        <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>{f.label}</label>
                        <input value={form[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value})} placeholder={f.ph} style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }} />
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Role</label>
                    <select value={form.user_type||'Security'} onChange={e=>setForm({...form,user_type:e.target.value})} style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }}>
                      {['Admin','Security','DRRM','Campus Personnel'].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Password {editId&&<span style={{ color:'var(--muted)', textTransform:'none', fontSize:'.65rem' }}>(blank = keep)</span>}</label>
                    <input type="password" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }} />
                  </div>
                </div>
              </div>
              <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={()=>setModal(null)} style={{ padding:'8px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:'.8rem', cursor:'pointer', fontFamily:'var(--font)' }}>Cancel</button>
                <button onClick={saveUser} style={{ padding:'8px 18px', background:'var(--accent2)', color:'white', border:'none', borderRadius:6, fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>Save</button>
              </div>
            </div>
          )}

          {/* DEVICE MODAL */}
          {modal === 'device' && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, width:480, maxWidth:'95vw', overflow:'hidden' }}>
              <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:'1rem', fontWeight:600 }}>{editId ? 'Edit Device' : 'Add Device'}</div>
                <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'1.2rem', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ padding:22 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                  <div>
                    <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Device ID</label>
                    <input value={form.device_id||''} onChange={e=>setForm({...form,device_id:e.target.value})} disabled={!!editId} placeholder="AG-009" style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none', opacity:editId?0.5:1 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Device Name</label>
                    <input value={form.device_name||''} onChange={e=>setForm({...form,device_name:e.target.value})} placeholder="AeroGuard Unit 9" style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }} />
                  </div>
                </div>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Building</label>
                  <select value={form.building||'Medina Lacson Building'} onChange={e=>setForm({...form,building:e.target.value})} style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }}>
                    {['Medina Lacson Building','New CEA Building','CAHS Building'].map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  {[
                    {key:'floor',label:'Floor',opts:['1F','2F']},
                    {key:'room',label:'Room',opts:['Room 101','Room 102','Room 103','Room 104','Room 105','Room 201','Room 202','Room 203','Room 204','Room 205']},
                    {key:'status',label:'Status',opts:['Online','Offline','Maintenance']},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>{f.label}</label>
                      <select value={form[f.key]||f.opts[0]} onChange={e=>setForm({...form,[f.key]:e.target.value})} style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }}>
                        {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={()=>setModal(null)} style={{ padding:'8px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:'.8rem', cursor:'pointer', fontFamily:'var(--font)' }}>Cancel</button>
                <button onClick={saveDevice} style={{ padding:'8px 18px', background:'var(--accent2)', color:'white', border:'none', borderRadius:6, fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>Save</button>
              </div>
            </div>
          )}

          {/* EQUIPMENT MODAL */}
          {modal === 'equipment' && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, width:480, maxWidth:'95vw', overflow:'hidden' }}>
              <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:'1rem', fontWeight:600 }}>Add Fire Equipment</div>
                <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'1.2rem', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ padding:22 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                  {[
                    {key:'equipment_type',label:'Type',opts:['ABC','CO2','Water','Foam']},
                    {key:'building',label:'Building',opts:['Medina Lacson Building','New CEA Building','CAHS Building']},
                    {key:'floor',label:'Floor',opts:['1F','2F']},
                    {key:'status',label:'Status',opts:['Active','Maintenance','Expired']},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>{f.label}</label>
                      <select value={form[f.key]||f.opts[0]} onChange={e=>setForm({...form,[f.key]:e.target.value})} style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }}>
                        {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Location Description</label>
                  <input value={form.location_description||''} onChange={e=>setForm({...form,location_description:e.target.value})} placeholder="e.g. Hallway near Room 201" style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }} />
                </div>
                <div>
                  <label style={{ fontSize:'.75rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'block' }}>Last Inspection Date</label>
                  <input type="date" value={form.last_inspection||''} onChange={e=>setForm({...form,last_inspection:e.target.value})} style={{ width:'100%', background:'var(--panel2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:'.85rem', fontFamily:'var(--font)', outline:'none' }} />
                </div>
              </div>
              <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={()=>setModal(null)} style={{ padding:'8px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:'.8rem', cursor:'pointer', fontFamily:'var(--font)' }}>Cancel</button>
                <button onClick={saveEquipment} style={{ padding:'8px 18px', background:'var(--accent2)', color:'white', border:'none', borderRadius:6, fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>Save</button>
              </div>
            </div>
          )}

          {/* DELETE MODAL */}
          {modal === 'delete' && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, width:360, maxWidth:'95vw', overflow:'hidden' }}>
              <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                <div style={{ fontWeight:600 }}>Confirm Delete</div>
                <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ padding:22, color:'var(--gray)', fontSize:'.875rem' }}>Delete "{deleteTarget?.label}"? This cannot be undone.</div>
              <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={()=>setModal(null)} style={{ padding:'8px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:'.8rem', cursor:'pointer', fontFamily:'var(--font)' }}>Cancel</button>
                <button onClick={confirmDelete} style={{ padding:'8px 18px', background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', borderRadius:6, color:'var(--red)', fontSize:'.8rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>Delete</button>
              </div>
            </div>
          )}

          {/* ACCESS DENIED */}
          {modal === 'access' && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, width:380, maxWidth:'95vw', overflow:'hidden' }}>
              <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                <div style={{ fontWeight:600 }}>Access Restricted</div>
                <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ padding:'32px 22px', textAlign:'center' }}>
                <div style={{ fontSize:'2.5rem', marginBottom:12 }}>🔒</div>
                <div style={{ fontSize:'1rem', fontWeight:600, marginBottom:8 }}>Admin Access Only</div>
                <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>This section is only available to <strong style={{ color:'var(--accent)' }}>Admin</strong> accounts.</p>
              </div>
              <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'center' }}>
                <button onClick={()=>setModal(null)} style={{ padding:'8px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontSize:'.8rem', cursor:'pointer', fontFamily:'var(--font)' }}>Go Back</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999 }}>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 16px', fontSize:'.8rem', minWidth:280, display:'flex', alignItems:'center', gap:10, boxShadow:'0 8px 24px rgba(0,0,0,.4)' }}>
            <div>{toast.type==='success'?'✅':toast.type==='error'?'❌':'ℹ️'}</div>
            <div><div style={{ fontWeight:600 }}>{toast.title}</div><div style={{ color:'var(--muted)', fontSize:'.72rem' }}>{toast.msg}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}