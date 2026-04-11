'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [view, setView] = useState('dashboard')
  const [devices, setDevices] = useState<any[]>([])
  const [incidents, setIncidents] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const [clock, setClock] = useState('')
  const [toast, setToast] = useState<{type:string,title:string,msg:string}|null>(null)
  const [modal, setModal] = useState<string|null>(null)
  const [form, setForm] = useState<any>({})
  const [editId, setEditId] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [incidentFilter, setIncidentFilter] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [deviceSearch, setDeviceSearch] = useState('')

  const isAdmin = user?.user_type === 'Admin'

  useEffect(() => {
    const stored = localStorage.getItem('ag_user')
    if (!stored) { router.push('/login'); return }
    setUser(JSON.parse(stored))
    loadDevices(); loadIncidents()
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-PH')), 1000)
    const r = setInterval(() => { loadDevices(); loadIncidents() }, 30000)
    return () => { clearInterval(t); clearInterval(r) }
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

  function logout() {
    localStorage.removeItem('ag_user')
    router.push('/login')
  }

  // ── SAVE USER ──
  async function saveUser() {
    const method = editId ? 'PUT' : 'POST'
    const payload = { ...form, user_id: editId }
    const d = await apiFetch('/api/users', method, payload)
    if(!d.success) { showToast('error','Error',d.message); return }
    showToast('success', editId?'User Updated':'User Added', form.full_name + ' saved.')
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
  const online = devices.filter(d=>d.status==='Online').length
  const activeAlerts = new Set(incidents.filter(i=>i.threat_level!=='Gray'&&!i.resolved).map(i=>i.device_id)).size
  const todayInc = incidents.filter(i=>new Date(i.created_at)>new Date(Date.now()-86400000)).length
  const redInc = incidents.find(i=>i.threat_level==='Red'&&!i.resolved)

  const navItems = [
    { id:'dashboard', icon:'📊', label:'Dashboard', section:'Monitor' },
    { id:'incidents', icon:'🔔', label:'Incident Log', section:'' },
    { id:'users',     icon:'👥', label:'User Accounts', section:'Manage', admin:true },
    { id:'devices',   icon:'📡', label:'Devices', section:'', admin:true },
    { id:'equipment', icon:'🧯', label:'Fire Equipment', section:'', admin:true },
  ]

  const chip: Record<string,string> = {
    Admin:'rgba(0,194,255,.12)|var(--accent)|rgba(0,194,255,.25)',
    Security:'rgba(34,197,94,.12)|var(--green)|rgba(34,197,94,.25)',
    DRRM:'rgba(249,115,22,.12)|var(--orange)|rgba(249,115,22,.25)',
    'Campus Personnel':'rgba(148,163,184,.1)|var(--gray)|rgba(148,163,184,.2)'
  }

  if (!user) return null

  const [chipBg, chipColor, chipBorder] = (chip[user.user_type]||chip['Campus Personnel']).split('|')

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'var(--font)' }}>

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
          {navItems.map((item, i) => (
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
            <div style={{ fontSize:'1.05rem', fontWeight:600 }}>
              {{ dashboard:'System Dashboard', incidents:'Incident Log', users:'User Accounts', devices:'Device Management', equipment:'Fire Equipment' }[view]}
            </div>
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
              {/* Stats */}
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
                {/* Device list */}
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
                      const pm = Math.random()*50+10
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

                {/* Right column */}
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {/* Recent alerts */}
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

                  {/* PM Cards */}
                  <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)' }}><span style={{ fontWeight:600, fontSize:'.875rem' }}>Live Sensor Readings</span></div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, padding:'14px 16px' }}>
                      {devices.filter(d=>d.status==='Online').slice(0,4).map(d => {
                        const pm = Math.random()*50+10
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
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
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
