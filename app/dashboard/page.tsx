'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const SESSION_KEY     = 'ag_user'
const LAST_ACTIVE_KEY = 'ag_last_active'

const THREAT_COLOR: Record<string,string> = {Gray:'#94a3b8',Yellow:'#eab308',Orange:'#f97316',Red:'#ef4444'}

// ── STATIC BUILDING / ROOM / EXTINGUISHER CONFIG ─────────────
// Each room has a fixed SVG center point on the 2D map
const ROOM_CONFIGS: Record<string, { x:number; y:number; building:string; floor:string; room:string }> = {
  'Medina Lacson Building|1F|Room 101': { x:117, y:220, building:'Medina Lacson Building', floor:'1F', room:'Room 101' },
  'Medina Lacson Building|1F|Room 102': { x:177, y:220, building:'Medina Lacson Building', floor:'1F', room:'Room 102' },
  'Medina Lacson Building|1F|Room 103': { x:237, y:220, building:'Medina Lacson Building', floor:'1F', room:'Room 103' },
  'Medina Lacson Building|2F|Room 201': { x:117, y:152, building:'Medina Lacson Building', floor:'2F', room:'Room 201' },
  'Medina Lacson Building|2F|Room 202': { x:177, y:152, building:'Medina Lacson Building', floor:'2F', room:'Room 202' },
  'Medina Lacson Building|2F|Room 203': { x:237, y:152, building:'Medina Lacson Building', floor:'2F', room:'Room 203' },
  'New CEA Building|1F|Room 101': { x:400, y:120, building:'New CEA Building', floor:'1F', room:'Room 101' },
  'New CEA Building|1F|Room 102': { x:465, y:120, building:'New CEA Building', floor:'1F', room:'Room 102' },
  'New CEA Building|1F|Room 103': { x:530, y:120, building:'New CEA Building', floor:'1F', room:'Room 103' },
  'New CEA Building|2F|Room 201': { x:400, y:195, building:'New CEA Building', floor:'2F', room:'Room 201' },
  'New CEA Building|2F|Room 204': { x:465, y:195, building:'New CEA Building', floor:'2F', room:'Room 204' },
  'New CEA Building|2F|Room 205': { x:530, y:195, building:'New CEA Building', floor:'2F', room:'Room 205' },
  'CAHS Building|1F|Room 103': { x:160, y:380, building:'CAHS Building', floor:'1F', room:'Room 103' },
  'CAHS Building|1F|Room 104': { x:225, y:380, building:'CAHS Building', floor:'1F', room:'Room 104' },
  'CAHS Building|1F|Room 105': { x:282, y:380, building:'CAHS Building', floor:'1F', room:'Room 105' },
  'CAHS Building|2F|Room 202': { x:160, y:450, building:'CAHS Building', floor:'2F', room:'Room 202' },
  'CAHS Building|2F|Room 203': { x:225, y:450, building:'CAHS Building', floor:'2F', room:'Room 203' },
  'CAHS Building|2F|Room 204': { x:282, y:450, building:'CAHS Building', floor:'2F', room:'Room 204' },
}

const EXT_CONFIGS: Record<string, { x:number; y:number }> = {
  // ── Medina Lacson Building ────────────────────────────────
  // DB value (row 1): "Hallway between Rooms 201-202" or similar — 2F
  'Medina Lacson Building|2F|Hallway Rooms 201-202':              { x:145, y:178 },
  'Medina Lacson Building|2F|Hallway between Rooms 201-202':      { x:145, y:178 },
  'Medina Lacson Building|2F|Hallway between Rooms 201 and 202':  { x:145, y:178 },
  // DB value (row 2): "Near main staircase, R…" — 1F
  'Medina Lacson Building|1F|Near main staircase':                { x:145, y:250 },
  'Medina Lacson Building|1F|Near main staircase, Room 101':      { x:145, y:250 },
  'Medina Lacson Building|1F|Near main staircase, Rooms 101-103': { x:145, y:250 },

  // ── New CEA Building ──────────────────────────────────────
  // DB value (row 3): "Hallway near Room 101 …" — 1F
  'New CEA Building|1F|Hallway near Room 101':                    { x:415, y:155 },
  'New CEA Building|1F|Hallway near Room 101 and 102':            { x:415, y:155 },
  // DB value (row 4): "Laboratory area near R…" — 1F
  'New CEA Building|1F|Laboratory near Room 103':                 { x:480, y:155 },
  'New CEA Building|1F|Laboratory area near Room 103':            { x:480, y:155 },
  'New CEA Building|1F|Laboratory area near Rooms 103':          { x:480, y:155 },
  // DB value (row 5): "Hallway between Rooms …" — 2F
  'New CEA Building|2F|Hallway Rooms 204-205':                    { x:480, y:235 },
  'New CEA Building|2F|Hallway between Rooms 204-205':            { x:480, y:235 },
  'New CEA Building|2F|Hallway between Rooms 204 and 205':        { x:480, y:235 },

  // ── CAHS Building ─────────────────────────────────────────
  // DB value (row 7): "Main hallway between R…" — 1F
  'CAHS Building|1F|Main hallway 103-104':                        { x:195, y:415 },
  'CAHS Building|1F|Main hallway between Rooms 103-104':          { x:195, y:415 },
  'CAHS Building|1F|Main hallway between Rooms 103 and 104':      { x:195, y:415 },
  'CAHS Building|1F|Main hallway between R':                      { x:195, y:415 },
  // DB value (row 8): "Supply room near Room …" — 1F (Foam, Expired)
  'CAHS Building|1F|Supply room near Room 105':                   { x:255, y:415 },
  'CAHS Building|1F|Supply room near Rooms 105':                  { x:255, y:415 },
  // DB value (row 9): "Hallway between Rooms …" — 2F
  'CAHS Building|2F|Hallway Rooms 201-202':                       { x:195, y:480 },
  'CAHS Building|2F|Hallway between Rooms 201-202':               { x:195, y:480 },
  'CAHS Building|2F|Hallway between Rooms 201 and 202':           { x:195, y:480 },
  // DB value (row 10): "Near nursing lab Room …" — 2F
  'CAHS Building|2F|Near nursing lab Room 203':                   { x:260, y:480 },
  'CAHS Building|2F|Near nursing lab Room 203 area':              { x:260, y:480 },
}

function getRoomPos(building:string, floor:string, room:string) {
  return ROOM_CONFIGS[`${building}|${floor}|${room}`] || null
}
function getExtPos(building:string, floor:string, desc:string): {x:number;y:number}|null {
  return EXT_CONFIGS[`${building}|${floor}|${desc}`] || null
}

// ── BUILDING SVG BLUEPRINTS ───────────────────────────────────
const BUILDINGS = [
  { id:'medina', name:'Medina Lacson Building', x:80, y:120, w:200, h:140, color:'#1e3a5f',
    rooms:[{l:'201',x:90,y:130,w:55,h:45},{l:'202',x:150,y:130,w:55,h:45},{l:'203',x:210,y:130,w:60,h:45},
           {l:'101',x:90,y:185,w:55,h:65},{l:'102',x:150,y:185,w:55,h:65},{l:'103',x:210,y:185,w:60,h:65}] },
  { id:'cea', name:'New CEA Building', x:360, y:80, w:220, h:160, color:'#1a3a2f',
    rooms:[{l:'101',x:370,y:90,w:60,h:60},{l:'102',x:435,y:90,w:60,h:60},{l:'103',x:500,y:90,w:70,h:60},
           {l:'201',x:370,y:160,w:60,h:70},{l:'204',x:435,y:160,w:60,h:70},{l:'205',x:500,y:160,w:70,h:70}] },
  { id:'cahs', name:'CAHS Building', x:120, y:340, w:200, h:150, color:'#3a1a2f',
    rooms:[{l:'103',x:130,y:350,w:60,h:60},{l:'104',x:195,y:350,w:60,h:60},{l:'105',x:260,y:350,w:50,h:60},
           {l:'202',x:130,y:420,w:60,h:60},{l:'203',x:195,y:420,w:60,h:60},{l:'204',x:260,y:420,w:50,h:60}] },
]
const ASSEMBLY = {x:580,y:340,w:100,h:60}

// ── BUILDING / ROOM OPTIONS ───────────────────────────────────
const BUILDINGS_LIST = ['Medina Lacson Building','New CEA Building','CAHS Building']

// Each room key is "floor|room" so we can derive floor automatically
const ROOMS_BY_BUILDING: Record<string, { floor:string; room:string; label:string }[]> = {
  'Medina Lacson Building': [
    {floor:'1F', room:'Room 101', label:'1F — Room 101'},
    {floor:'1F', room:'Room 102', label:'1F — Room 102'},
    {floor:'1F', room:'Room 103', label:'1F — Room 103'},
    {floor:'2F', room:'Room 201', label:'2F — Room 201'},
    {floor:'2F', room:'Room 202', label:'2F — Room 202'},
    {floor:'2F', room:'Room 203', label:'2F — Room 203'},
  ],
  'New CEA Building': [
    {floor:'1F', room:'Room 101', label:'1F — Room 101'},
    {floor:'1F', room:'Room 102', label:'1F — Room 102'},
    {floor:'1F', room:'Room 103', label:'1F — Room 103'},
    {floor:'2F', room:'Room 201', label:'2F — Room 201'},
    {floor:'2F', room:'Room 204', label:'2F — Room 204'},
    {floor:'2F', room:'Room 205', label:'2F — Room 205'},
  ],
  'CAHS Building': [
    {floor:'1F', room:'Room 103', label:'1F — Room 103'},
    {floor:'1F', room:'Room 104', label:'1F — Room 104'},
    {floor:'1F', room:'Room 105', label:'1F — Room 105'},
    {floor:'2F', room:'Room 202', label:'2F — Room 202'},
    {floor:'2F', room:'Room 203', label:'2F — Room 203'},
    {floor:'2F', room:'Room 204', label:'2F — Room 204'},
  ],
}

const EXT_LOCATIONS_BY_BUILDING: Record<string, { floor:string; desc:string; label:string }[]> = {
  'Medina Lacson Building': [
    {floor:'2F', desc:'Hallway between Rooms 201-202',      label:'2F — Hallway between Rooms 201-202'},
    {floor:'1F', desc:'Near main staircase, Rooms 101-103', label:'1F — Near main staircase, Rooms 101-103'},
  ],
  'New CEA Building': [
    {floor:'1F', desc:'Hallway near Room 101 and 102',     label:'1F — Hallway near Room 101 and 102'},
    {floor:'1F', desc:'Laboratory area near Room 103',     label:'1F — Laboratory area near Room 103'},
    {floor:'2F', desc:'Hallway between Rooms 204-205',     label:'2F — Hallway between Rooms 204-205'},
  ],
  'CAHS Building': [
    {floor:'1F', desc:'Main hallway between Rooms 103-104', label:'1F — Main hallway between Rooms 103-104'},
    {floor:'1F', desc:'Supply room near Room 105',          label:'1F — Supply room near Room 105'},
    {floor:'2F', desc:'Hallway between Rooms 201-202',      label:'2F — Hallway between Rooms 201-202'},
    {floor:'2F', desc:'Near nursing lab Room 203',          label:'2F — Near nursing lab Room 203'},
  ],
}

// ── UI HELPERS ────────────────────────────────────────────────
const SBadge: React.CSSProperties = {display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:4,fontSize:'.7rem',fontWeight:600,fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'.5px'}

function Badge({status}:{status:string}) {
  const m:Record<string,React.CSSProperties>={
    Online:{background:'rgba(34,197,94,.12)',color:'var(--green)',border:'1px solid rgba(34,197,94,.25)'},
    Offline:{background:'rgba(239,68,68,.12)',color:'var(--red)',border:'1px solid rgba(239,68,68,.25)'},
    Maintenance:{background:'rgba(234,179,8,.12)',color:'var(--yellow)',border:'1px solid rgba(234,179,8,.25)'},
    Active:{background:'rgba(34,197,94,.12)',color:'var(--green)',border:'1px solid rgba(34,197,94,.25)'},
    Expired:{background:'rgba(239,68,68,.12)',color:'var(--red)',border:'1px solid rgba(239,68,68,.25)'},
  }
  return <span style={{...SBadge,...(m[status]||m.Maintenance)}}>{status}</span>
}

function ThreatBadge({level}:{level:string}) {
  const m:Record<string,React.CSSProperties>={
    Gray:{background:'rgba(148,163,184,.12)',color:'#94a3b8',border:'1px solid rgba(148,163,184,.25)'},
    Yellow:{background:'rgba(234,179,8,.12)',color:'var(--yellow)',border:'1px solid rgba(234,179,8,.3)'},
    Orange:{background:'rgba(249,115,22,.15)',color:'var(--orange)',border:'1px solid rgba(249,115,22,.3)'},
    Red:{background:'rgba(239,68,68,.15)',color:'var(--red)',border:'1px solid rgba(239,68,68,.35)'},
  }
  const icons:Record<string,string>={Gray:'⬜',Yellow:'🟡',Orange:'🟠',Red:'🔴'}
  return <span style={{...SBadge,...(m[level]||m.Gray)}}>{icons[level]} {level}</span>
}

function RoleBadge({role}:{role:string}) {
  const c:Record<string,string>={Admin:'var(--accent)',Security:'var(--green)',DRRM:'var(--orange)','Campus Personnel':'var(--muted)'}
  return <span style={{color:c[role]||'var(--muted)',fontWeight:600}}>{role}</span>
}

const initials=(n:string)=>n.split(' ').map((p:string)=>p[0]).join('').slice(0,2).toUpperCase()
const pmColor=(v:number)=>v<35?'var(--green)':v<150?'var(--yellow)':v<300?'var(--orange)':'var(--red)'
const fmtTime=(ts:string)=>{const d=new Date(ts);return d.toLocaleDateString('en-PH',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}
const timeAgo=(ts:string)=>{const s=(Date.now()-new Date(ts).getTime())/1000;if(s<60)return`${Math.floor(s)}s ago`;if(s<3600)return`${Math.floor(s/60)}m ago`;return`${Math.floor(s/3600)}h ago`}

// ── CAMPUS MAP ────────────────────────────────────────────────
function CampusMap({devices,incidents,equipment}:{devices:any[],incidents:any[],equipment:any[]}) {
  const [tip,setTip]=useState<any>(null)

  const getThreat=(d:any)=>{
    const inc=incidents.find(i=>i.device_id===d.device_id&&!i.resolved)
    return inc?.threat_level||'Gray'
  }

  return (
    <div style={{position:'relative',width:'100%'}}>
      <svg viewBox="0 0 720 560" style={{width:'100%',height:'auto',background:'#0d1421',borderRadius:8,border:'1px solid var(--border)'}}>
        {/* Grid */}
        {Array.from({length:18}).map((_,i)=><line key={`v${i}`} x1={i*40} y1={0} x2={i*40} y2={560} stroke="rgba(255,255,255,0.03)" strokeWidth={1}/>)}
        {Array.from({length:14}).map((_,i)=><line key={`h${i}`} x1={0} y1={i*40} x2={720} y2={i*40} stroke="rgba(255,255,255,0.03)" strokeWidth={1}/>)}
        {/* Roads */}
        <rect x={310} y={0} width={40} height={560} fill="rgba(255,255,255,0.04)" rx={2}/>
        <rect x={0} y={290} width={720} height={40} fill="rgba(255,255,255,0.04)" rx={2}/>
        <text x={325} y={275} fill="rgba(255,255,255,0.15)" fontSize={8} textAnchor="middle" fontFamily="monospace">ROAD</text>
        {/* Buildings */}
        {BUILDINGS.map(b=>(
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} rx={4} stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>
            <text x={b.x+b.w/2} y={b.y-6} fill="rgba(255,255,255,0.5)" fontSize={7} textAnchor="middle" fontFamily="monospace">{b.name.toUpperCase()}</text>
            {b.rooms.map(r=>(
              <g key={r.l}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.04)" rx={2} stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>
                <text x={r.x+r.w/2} y={r.y+r.h/2+3} fill="rgba(255,255,255,0.25)" fontSize={7} textAnchor="middle" fontFamily="monospace">{r.l}</text>
              </g>
            ))}
          </g>
        ))}
        {/* Assembly area */}
        <rect x={ASSEMBLY.x} y={ASSEMBLY.y} width={ASSEMBLY.w} height={ASSEMBLY.h} fill="rgba(34,197,94,0.1)" rx={6} stroke="rgba(34,197,94,0.4)" strokeWidth={1.5} strokeDasharray="4 3"/>
        <text x={ASSEMBLY.x+ASSEMBLY.w/2} y={ASSEMBLY.y+ASSEMBLY.h/2-4} fill="#22c55e" fontSize={7} textAnchor="middle" fontFamily="monospace" fontWeight="bold">ASSEMBLY</text>
        <text x={ASSEMBLY.x+ASSEMBLY.w/2} y={ASSEMBLY.y+ASSEMBLY.h/2+8} fill="#22c55e" fontSize={7} textAnchor="middle" fontFamily="monospace">AREA</text>
        {/* Evacuation route for Orange/Red */}
        {incidents.filter(i=>!i.resolved&&(i.threat_level==='Orange'||i.threat_level==='Red')).slice(0,1).map(inc=>{
          const d=devices.find(dv=>dv.device_id===inc.device_id)
          if(!d) return null
          const pos=getRoomPos(d.building,d.floor,d.room)
          if(!pos) return null
          return (
            <g key={`evac-${inc.incident_id}`}>
              <line x1={pos.x} y1={pos.y} x2={ASSEMBLY.x} y2={ASSEMBLY.y+ASSEMBLY.h/2} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6}/>
              <polygon points={`${ASSEMBLY.x},${ASSEMBLY.y+ASSEMBLY.h/2} ${ASSEMBLY.x-8},${ASSEMBLY.y+ASSEMBLY.h/2-5} ${ASSEMBLY.x-8},${ASSEMBLY.y+ASSEMBLY.h/2+5}`} fill="#22c55e" opacity={0.6}/>
              <text x={(pos.x+ASSEMBLY.x)/2} y={(pos.y+ASSEMBLY.y+ASSEMBLY.h/2)/2-6} fill="#22c55e" fontSize={7} textAnchor="middle" fontFamily="monospace" opacity={0.8}>EVACUATION ROUTE</text>
            </g>
          )
        })}
        {/* Fire extinguishers — rendered from live equipment data */}
        {equipment.map(e=>{
          const pos=getExtPos(e.building, e.floor, e.location_description)
          if(!pos) return null
          const isExpired = e.status === 'Expired'
          const isMaintenance = e.status === 'Maintenance'
          const strokeColor = isExpired ? '#ef4444' : isMaintenance ? '#eab308' : '#f97316'
          return (
            <g key={e.equipment_id} style={{cursor:'pointer'}}
               onMouseEnter={()=>setTip({type:'ext',data:e,x:pos.x,y:pos.y})}
               onMouseLeave={()=>setTip(null)}>
              <circle cx={pos.x} cy={pos.y} r={7} fill="rgba(249,115,22,0.2)" stroke={strokeColor} strokeWidth={1.5}/>
              <text x={pos.x} y={pos.y+4} textAnchor="middle" fontSize={9} fill={strokeColor}>🧯</text>
            </g>
          )
        })}
        {/* Devices — rendered from live device data */}
        {devices.map(d=>{
          const pos=getRoomPos(d.building, d.floor, d.room)
          if(!pos) return null
          const threat=getThreat(d)
          const color=THREAT_COLOR[threat]||'#94a3b8'
          const active=threat!=='Gray'
          return (
            <g key={d.device_id} style={{cursor:'pointer'}}
               onMouseEnter={()=>setTip({type:'device',data:d,threat,x:pos.x,y:pos.y})}
               onMouseLeave={()=>setTip(null)}>
              {active&&(
                <circle cx={pos.x} cy={pos.y} r={14} fill="none" stroke={color} strokeWidth={1} opacity={0.4}>
                  <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={pos.x} cy={pos.y} r={8} fill={color} opacity={d.status==='Online'?0.9:0.3}/>
              <circle cx={pos.x} cy={pos.y} r={8} fill="none" stroke="white" strokeWidth={1} opacity={0.5}/>
              <text x={pos.x} y={pos.y+4} textAnchor="middle" fontSize={7} fill="white" fontWeight="bold">📡</text>
              <text x={pos.x} y={pos.y+18} textAnchor="middle" fontSize={6} fill="rgba(255,255,255,0.6)" fontFamily="monospace">{d.device_id}</text>
            </g>
          )
        })}
        {/* Tooltip */}
        {tip&&(
          <g>
            <rect x={tip.x>500?tip.x-148:tip.x+12} y={tip.y>400?tip.y-80:tip.y+12} width={143} height={tip.type==='device'?78:68} fill="#111827" rx={4} stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
            {tip.type==='device'?(
              <>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-62:tip.y+26} fill="white" fontSize={8} fontWeight="bold" fontFamily="monospace">{tip.data.device_id}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-50:tip.y+38} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tip.data.device_name}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-38:tip.y+50} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tip.data.floor} · {tip.data.room}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-26:tip.y+62} fill={tip.data.status==='Online'?'#22c55e':'#ef4444'} fontSize={7} fontFamily="monospace">● {tip.data.status}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-14:tip.y+74} fill={THREAT_COLOR[tip.threat]||'#94a3b8'} fontSize={7} fontFamily="monospace">⚠ {tip.threat} Level</text>
              </>
            ):(
              <>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-62:tip.y+26} fill="#f97316" fontSize={8} fontWeight="bold" fontFamily="monospace">🧯 {tip.data.equipment_type}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-50:tip.y+38} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tip.data.building.split(' ')[0]}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-38:tip.y+50} fill="#94a3b8" fontSize={7} fontFamily="monospace">{tip.data.floor} — {tip.data.location_description}</text>
                <text x={tip.x>500?tip.x-140:tip.x+18} y={tip.y>400?tip.y-26:tip.y+62} fill={tip.data.status==='Active'?'#22c55e':tip.data.status==='Expired'?'#ef4444':'#eab308'} fontSize={7} fontFamily="monospace">● {tip.data.status}</text>
              </>
            )}
          </g>
        )}
      </svg>
      <div style={{display:'flex',gap:16,marginTop:10,flexWrap:'wrap',fontSize:'.7rem',color:'var(--muted)',fontFamily:'var(--mono)'}}>
        {[{color:'#94a3b8',label:'Gray — Safe'},{color:'#eab308',label:'Yellow — Vaping'},{color:'#f97316',label:'Orange — Small Fire'},{color:'#ef4444',label:'Red — Critical'}].map(l=>(
          <div key={l.label} style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:'50%',background:l.color}}/>{l.label}</div>
        ))}
        <div style={{display:'flex',alignItems:'center',gap:5}}><span>🧯</span> Fire Extinguisher</div>
        <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,borderRadius:2,background:'rgba(34,197,94,0.15)',border:'1px solid #22c55e'}}/> Assembly Area</div>
      </div>
    </div>
  )
}

// ── EXPORT HELPERS ────────────────────────────────────────────
function exportCSV(incidents: any[]) {
  const rows=['Time,Device,Location,Level,PM2.5,Status',...incidents.map(i=>`"${fmtTime(i.created_at)}","${i.device_id}","${i.location}","${i.threat_level}","${i.pm25_value}","${i.resolved?'Resolved':'Active'}"`)]
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'})),download:'aeroguard_incidents.csv'});a.click()
}
function exportTXT(incidents: any[]) {
  const lines=['AeroGuard Incident Report','Generated: '+new Date().toLocaleString('en-PH'),'','Time | Device | Location | Level | PM2.5 | Status','='.repeat(80),...incidents.map(i=>`${fmtTime(i.created_at)} | ${i.device_id} | ${i.location} | ${i.threat_level} | ${i.pm25_value} µg/m³ | ${i.resolved?'Resolved':'Active'}`)]
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'})),download:'aeroguard_incidents.txt'});a.click()
}
async function exportPDF(incidents: any[]) {
  const res=await fetch('/api/export/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({incidents})})
  if(!res.ok){alert('PDF export failed.');return}
  const blob=await res.blob()
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'aeroguard_incidents.pdf'}).click()
}
async function exportDOCX(incidents: any[]) {
  const res=await fetch('/api/export/docx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({incidents})})
  if(!res.ok){alert('DOCX export failed.');return}
  const blob=await res.blob()
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'aeroguard_incidents.docx'}).click()
}

// ── VALIDATION ────────────────────────────────────────────────
function validatePhone(p:string):string|null{if(!p)return null;const c=p.replace(/\s/g,'');if(!/^09\d{9}$/.test(c))return 'Phone must start with 09 and be exactly 11 digits.';return null}
function validateEmail(e:string):string|null{if(!e)return null;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return 'Please enter a valid email address.';return null}
function validateUsername(u:string):string|null{if(!u)return 'Username is required.';if(u.length<4)return 'Username must be at least 4 characters.';if(!/^[a-zA-Z0-9_]+$/.test(u))return 'Username may only contain letters, numbers, and underscores.';return null}

// ── MAIN DASHBOARD ────────────────────────────────────────────
export default function Dashboard() {
  const router=useRouter()
  const [user,setUser]=useState<any>(null)
  const [view,setView]=useState('dashboard')
  const [devices,setDevices]=useState<any[]>([])
  const [incidents,setIncidents]=useState<any[]>([])
  const [users,setUsers]=useState<any[]>([])
  const [equipment,setEquipment]=useState<any[]>([])
  const [clock,setClock]=useState('')
  const [toast,setToast]=useState<any>(null)
  const [modal,setModal]=useState<string|null>(null)
  const [form,setForm]=useState<any>({})
  const [formErrors,setFormErrors]=useState<Record<string,string>>({})
  const [editId,setEditId]=useState<any>(null)
  const [deleteTarget,setDeleteTarget]=useState<any>(null)
  const [incFilter,setIncFilter]=useState('')
  const [userSearch,setUserSearch]=useState('')
  const [devSearch,setDevSearch]=useState('')
  const [idleWarn,setIdleWarn]=useState(false)
  const [exportMenu,setExportMenu]=useState(false)
  const [exportLoading,setExportLoading]=useState<string|null>(null)
  const [otpLoading,setOtpLoading]=useState(false)
  const idleTimer=useRef<any>(null)
  const warnTimer=useRef<any>(null)

  const isAdmin=user?.user_type==='Admin'

  const resetIdle=()=>{
    localStorage.setItem(LAST_ACTIVE_KEY,Date.now().toString())
    setIdleWarn(false)
    clearTimeout(idleTimer.current);clearTimeout(warnTimer.current)
    warnTimer.current=setTimeout(()=>setIdleWarn(true),IDLE_TIMEOUT_MS-2*60*1000)
    idleTimer.current=setTimeout(()=>doLogout(true),IDLE_TIMEOUT_MS)
  }

  useEffect(()=>{
    const stored=localStorage.getItem(SESSION_KEY)
    if(!stored){router.push('/login');return}
    const last=localStorage.getItem(LAST_ACTIVE_KEY)
    if(last&&Date.now()-parseInt(last)>IDLE_TIMEOUT_MS){
      localStorage.removeItem(SESSION_KEY);localStorage.removeItem(LAST_ACTIVE_KEY);router.push('/login');return
    }
    setUser(JSON.parse(stored))
    loadDevices();loadIncidents()
    const t=setInterval(()=>setClock(new Date().toLocaleTimeString('en-PH')),1000)
    const r=setInterval(()=>{loadDevices();loadIncidents()},30000)
    const evts=['mousedown','mousemove','keydown','scroll','touchstart','click']
    evts.forEach(e=>window.addEventListener(e,resetIdle,{passive:true}))
    resetIdle()
    return()=>{
      clearInterval(t);clearInterval(r)
      clearTimeout(idleTimer.current);clearTimeout(warnTimer.current)
      evts.forEach(e=>window.removeEventListener(e,resetIdle))
    }
  },[])

  const showToast=(type:string,title:string,msg:string)=>{setToast({type,title,msg});setTimeout(()=>setToast(null),6000)}
  const api=async(url:string,method='GET',body?:any)=>{
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
    return res.json()
  }

  const loadDevices=async()=>{const d=await api('/api/devices');if(d.success)setDevices(d.data)}
  const loadIncidents=async(level='')=>{const d=await api(`/api/incidents${level?`?level=${level}`:''}`);if(d.success)setIncidents(d.data)}
  const loadUsers=async()=>{const d=await api('/api/users');if(d.success)setUsers(d.data)}
  const loadEquipment=async()=>{const d=await api('/api/equipment');if(d.success)setEquipment(d.data)}

  function switchView(v:string){
    setView(v)
    if(v==='users')loadUsers()
    if(v==='equipment')loadEquipment()
    if(v==='devices')loadDevices()
    if(v==='incidents')loadIncidents()
    if(v==='map'){loadDevices();loadIncidents();loadEquipment()}
  }
  function guardedView(v:string){if(!isAdmin){setModal('access');return}switchView(v)}
  function doLogout(auto=false){
    localStorage.removeItem(SESSION_KEY);localStorage.removeItem(LAST_ACTIVE_KEY)
    if(auto)showToast('info','Session Expired','Logged out due to inactivity.')
    router.push('/login')
  }

  // ── OCCUPANCY: check if a room already has a device ──────────
  function checkDeviceOccupied(building:string, floor:string, room:string, excludeId?:string): string|null {
    const existing=devices.find(d=>d.building===building&&d.floor===floor&&d.room===room&&d.device_id!==excludeId)
    if(existing) return `${floor} — ${room} in ${building} is already occupied by device ${existing.device_id}.`
    return null
  }

  // ── OCCUPANCY: check if a location already has equipment ─────
  function checkExtOccupied(building:string, floor:string, desc:string, excludeId?:number): string|null {
    const existing=equipment.find(e=>e.building===building&&e.floor===floor&&e.location_description===desc&&e.equipment_id!==excludeId)
    if(existing) return `${floor} — ${desc} in ${building} already has a ${existing.equipment_type} extinguisher.`
    return null
  }

  // ── SAVE USER ─────────────────────────────────────────────────
  async function saveUser(){
    const errs:Record<string,string>={}
    if(!form.full_name?.trim()) errs.full_name='Full name is required.'
    const uErr=validateUsername(form.username?.trim()||'')
    if(uErr) errs.username=uErr
    if(!form.user_type) errs.user_type='Role is required.'
    if(!form.email?.trim()) errs.email='Email is required to send the OTP.'
    else{const eErr=validateEmail(form.email.trim());if(eErr)errs.email=eErr}
    if(form.phone){const p=validatePhone(form.phone.trim());if(p)errs.phone=p}
    if(Object.keys(errs).length){setFormErrors(errs);return}
    setFormErrors({})
    const d=await api('/api/users','POST',{full_name:form.full_name.trim(),username:form.username.trim(),user_type:form.user_type,email:form.email.trim(),phone:form.phone||null})
    if(!d.success){showToast('error','Error',d.message);return}
    setOtpLoading(true)
    await api('/api/users/otp','POST',{email:d.email,user_id:d.user_id})
    setOtpLoading(false)
    showToast('success','Account Created',`OTP sent to ${d.email}.`)
    setModal(null);loadUsers()
  }

  async function saveRole(){
    if(!form.user_type){showToast('error','Error','Role is required.');return}
    const d=await api('/api/users','PUT',{mode:'role',admin_id:user.user_id,user_id:editId,user_type:form.user_type})
    if(!d.success){showToast('error','Error',d.message);return}
    showToast('success','Role Updated','User role changed.')
    setModal(null);loadUsers()
  }

  async function saveSelfProfile(){
    const errs:Record<string,string>={}
    if(!form.full_name?.trim()) errs.full_name='Full name is required.'
    const uErr=validateUsername(form.username?.trim()||'')
    if(uErr) errs.username=uErr
    if(form.email){const e=validateEmail(form.email.trim());if(e)errs.email=e}
    if(form.phone){const p=validatePhone(form.phone.trim());if(p)errs.phone=p}
    if(Object.keys(errs).length){setFormErrors(errs);return}
    setFormErrors({})
    const d=await api('/api/users','PUT',{mode:'self',user_id:user.user_id,full_name:form.full_name,username:form.username,email:form.email||'',phone:form.phone||''})
    if(!d.success){showToast('error','Error',d.message);return}
    const updated={...user,...d.user}
    localStorage.setItem(SESSION_KEY,JSON.stringify(updated))
    setUser(updated)
    showToast('success','Profile Updated','Your profile has been updated.')
    setModal(null);loadUsers()
  }

  async function changePassword(){
    if(!form.current_password){setFormErrors({current_password:'Current password required.'});return}
    if(!form.new_password){setFormErrors({new_password:'New password required.'});return}
    if(form.new_password.length<8){setFormErrors({new_password:'Minimum 8 characters.'});return}
    if(form.new_password!==form.confirm_password){setFormErrors({confirm_password:'Passwords do not match.'});return}
    setFormErrors({})
    const d=await api('/api/users/set-password','PUT',{user_id:user.user_id,current_password:form.current_password,new_password:form.new_password})
    if(!d.success){showToast('error','Error',d.message);return}
    showToast('success','Password Changed','Your password has been updated.')
    setModal(null)
  }

  // ── SAVE DEVICE ───────────────────────────────────────────────
  // form.roomKey = "floor|room" combined selector
  async function saveDevice(){
    const errs:Record<string,string>={}
    if(!form.device_id?.trim()) errs.device_id='Device ID is required.'
    if(!form.device_name?.trim()) errs.device_name='Device name is required.'
    if(!form.building) errs.building='Building is required.'
    if(!form.roomKey) errs.roomKey='Room is required.'

    if(!Object.keys(errs).length){
      // Derive floor + room from roomKey
      const [floor, ...roomParts] = (form.roomKey||'').split('|')
      const room = roomParts.join('|')
      const occ=checkDeviceOccupied(form.building, floor, room, editId||undefined)
      if(occ) errs.roomKey=occ
    }

    if(Object.keys(errs).length){setFormErrors(errs);return}
    setFormErrors({})

    const [floor, ...roomParts] = (form.roomKey||'').split('|')
    const room = roomParts.join('|')

    const payload={
      device_id: form.device_id?.trim().toUpperCase(),
      device_name: form.device_name?.trim(),
      building: form.building,
      floor,
      room,
      status: form.status||'Online',
    }
    const d=await api('/api/devices', editId?'PUT':'POST', payload)
    if(!d.success){showToast('error','Error',d.message);return}
    showToast('success', editId?'Device Updated':'Device Added','Saved.')
    setModal(null);loadDevices()
  }

  // ── SAVE EQUIPMENT ────────────────────────────────────────────
  // form.extKey = "floor|desc" combined selector
  async function saveEquipment(){
    const errs:Record<string,string>={}
    if(!form.equipment_type) errs.equipment_type='Type is required.'
    if(!form.building) errs.building='Building is required.'
    if(!form.extKey) errs.extKey='Location is required.'

    if(!Object.keys(errs).length){
      const [floor, ...descParts] = (form.extKey||'').split('|')
      const desc = descParts.join('|')
      const occ=checkExtOccupied(form.building, floor, desc, editId||undefined)
      if(occ) errs.extKey=occ
    }

    if(Object.keys(errs).length){setFormErrors(errs);return}
    setFormErrors({})

    const [floor, ...descParts] = (form.extKey||'').split('|')
    const desc = descParts.join('|')

    const payload={
      ...(editId?{equipment_id:editId}:{}),
      equipment_type: form.equipment_type,
      building: form.building,
      floor,
      location_description: desc,
      status: form.status||'Active',
      last_inspection: form.last_inspection||null,
    }
    const d=await api('/api/equipment', editId?'PUT':'POST', payload)
    if(!d.success){showToast('error','Error',d.message);return}
    showToast('success', editId?'Equipment Updated':'Equipment Added','Saved.')
    setModal(null);loadEquipment()
  }

  // ── DELETE ────────────────────────────────────────────────────
  async function confirmDelete(){
    if(!deleteTarget) return
    const urls:Record<string,string>={user:'/api/users',device:'/api/devices',equipment:'/api/equipment'}
    const keys:Record<string,string>={user:'user_id',device:'device_id',equipment:'equipment_id'}
    const d=await api(urls[deleteTarget.type],'DELETE',{[keys[deleteTarget.type]]:deleteTarget.id})
    if(!d.success){showToast('error','Error',d.message);return}
    showToast('success','Deleted','Record removed.')
    setModal(null);setDeleteTarget(null)
    if(deleteTarget.type==='user')loadUsers()
    if(deleteTarget.type==='device'){loadDevices();loadIncidents()}
    if(deleteTarget.type==='equipment')loadEquipment()
  }

  async function handleExport(type:string){
    setExportMenu(false);setExportLoading(type)
    try{
      if(type==='csv') exportCSV(incidents)
      else if(type==='txt') exportTXT(incidents)
      else if(type==='pdf') await exportPDF(incidents)
      else if(type==='docx') await exportDOCX(incidents)
    } finally{setExportLoading(null)}
  }

  const online=devices.filter(d=>d.status==='Online').length
  const activeAlerts=new Set(incidents.filter(i=>i.threat_level!=='Gray'&&!i.resolved).map(i=>i.device_id)).size
  const todayInc=incidents.filter(i=>new Date(i.created_at)>new Date(Date.now()-86400000)).length
  const redInc=incidents.find(i=>i.threat_level==='Red'&&!i.resolved)

  const navItems=[
    {id:'dashboard',icon:'📊',label:'Dashboard',section:'Monitor'},
    {id:'map',icon:'🗺️',label:'Campus Map',section:''},
    {id:'incidents',icon:'🔔',label:'Incident Log',section:''},
    {id:'users',icon:'👥',label:'User Accounts',section:'Manage',admin:true},
    {id:'devices',icon:'📡',label:'Devices',section:'',admin:true},
    {id:'equipment',icon:'🧯',label:'Fire Equipment',section:'',admin:true},
  ]

  const chip:Record<string,string>={
    Admin:'rgba(0,194,255,.12)|var(--accent)|rgba(0,194,255,.25)',
    Security:'rgba(34,197,94,.12)|var(--green)|rgba(34,197,94,.25)',
    DRRM:'rgba(249,115,22,.12)|var(--orange)|rgba(249,115,22,.25)',
    'Campus Personnel':'rgba(148,163,184,.1)|var(--gray)|rgba(148,163,184,.2)',
  }

  if(!user) return null
  const [chipBg,chipColor,chipBorder]=(chip[user.user_type]||chip['Campus Personnel']).split('|')

  const input=(key:string,ph:string,type='text',disabled=false)=>(
    <div>
      <input type={type} value={form[key]||''} onChange={e=>{setForm({...form,[key]:e.target.value});setFormErrors({...formErrors,[key]:''})}} disabled={disabled}
        placeholder={ph} style={{width:'100%',background:'var(--panel2)',border:`1px solid ${formErrors[key]?'var(--red)':'var(--border)'}`,borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none',opacity:disabled?0.5:1}}/>
      {formErrors[key]&&<div style={{color:'var(--red)',fontSize:'.7rem',marginTop:3}}>⚠ {formErrors[key]}</div>}
    </div>
  )
  const lbl=(t:string)=><label style={{fontSize:'.75rem',color:'var(--muted)',textTransform:'uppercase' as const,letterSpacing:1,marginBottom:6,display:'block'}}>{t}</label>

  // Derived room list for current building in device form
  const currentRoomOptions = ROOMS_BY_BUILDING[form.building] || []
  const currentExtOptions  = EXT_LOCATIONS_BY_BUILDING[form.building] || []

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'var(--font)'}}>
      {idleWarn&&(
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9999,background:'rgba(234,179,8,0.95)',color:'#000',padding:'10px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'.85rem',fontWeight:600}}>
          <span>⚠️ You'll be logged out in 2 minutes due to inactivity.</span>
          <button onClick={resetIdle} style={{background:'#000',color:'#eab308',border:'none',borderRadius:6,padding:'4px 14px',cursor:'pointer',fontWeight:700,fontSize:'.8rem'}}>Stay Logged In</button>
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{width:240,background:'var(--panel)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:100}}>
        <div style={{padding:'20px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,background:'linear-gradient(135deg,#0072ff,#00c2ff)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🛡️</div>
          <div><div style={{fontSize:'1.1rem',fontWeight:700}}>AeroGuard</div><div style={{fontSize:'.65rem',color:'var(--muted)',fontFamily:'var(--mono)',letterSpacing:1,textTransform:'uppercase'}}>BPSU Fire Safety</div></div>
        </div>
        <nav style={{padding:'12px 0',flex:1}}>
          {navItems.map(item=>(
            <div key={item.id}>
              {item.section&&<div style={{padding:'10px 22px 4px',fontSize:'.65rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:2,fontFamily:'var(--mono)'}}>{item.section}</div>}
              <div onClick={()=>item.admin?guardedView(item.id):switchView(item.id)} style={{padding:'10px 22px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,fontSize:'.875rem',color:view===item.id?'var(--accent)':'var(--gray)',borderLeft:view===item.id?'2px solid var(--accent)':'2px solid transparent',background:view===item.id?'rgba(0,194,255,.08)':'transparent',transition:'all .15s'}}>
                <span>{item.icon}</span>{item.label}
                {item.admin&&!isAdmin&&<span style={{fontSize:'.6rem',marginLeft:'auto',color:'var(--muted)'}}>🔒</span>}
              </div>
            </div>
          ))}
        </nav>
        <div style={{padding:'16px 22px',borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'var(--panel2)',borderRadius:8,marginBottom:10}}>
            <div style={{width:30,height:30,background:'linear-gradient(135deg,#0072ff,#00c2ff)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,flexShrink:0}}>{user&&initials(user.full_name)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'.8rem',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.full_name}</div>
              <div style={{fontSize:'.65rem',color:'var(--muted)'}}>{user?.user_type}</div>
            </div>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <button onClick={()=>{setForm({full_name:user.full_name,username:user.username,email:user.email||'',phone:user.phone||''});setFormErrors({});setModal('selfEdit')}} style={{flex:1,padding:'6px 0',background:'rgba(0,194,255,.08)',border:'1px solid rgba(0,194,255,.2)',borderRadius:6,color:'var(--accent)',fontSize:'.68rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>✏️ Profile</button>
            <button onClick={()=>{setForm({});setFormErrors({});setModal('changePassword')}} style={{flex:1,padding:'6px 0',background:'rgba(234,179,8,.08)',border:'1px solid rgba(234,179,8,.2)',borderRadius:6,color:'var(--yellow)',fontSize:'.68rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>🔑 Password</button>
          </div>
          <button onClick={()=>doLogout()} style={{width:'100%',padding:8,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:6,color:'var(--red)',fontSize:'.78rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>🚪 &nbsp;Sign Out</button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{marginLeft:240,flex:1,display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 28px',background:'var(--panel)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:50}}>
          <div>
            <div style={{fontSize:'1.05rem',fontWeight:600}}>{{dashboard:'System Dashboard',map:'Campus Map',incidents:'Incident Log',users:'User Accounts',devices:'Device Management',equipment:'Fire Equipment'}[view]}</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',fontFamily:'var(--mono)'}}>AeroGuard / {view}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontSize:'.68rem',padding:'3px 10px',borderRadius:20,fontFamily:'var(--mono)',fontWeight:600,textTransform:'uppercase',background:chipBg,color:chipColor,border:`1px solid ${chipBorder}`}}>{user?.user_type}</span>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'.75rem',color:'var(--green)',fontFamily:'var(--mono)'}}><div style={{width:8,height:8,background:'var(--green)',borderRadius:'50%'}}/> SYSTEM LIVE</div>
            <div style={{fontSize:'.75rem',color:'var(--muted)',fontFamily:'var(--mono)'}}>{clock}</div>
          </div>
        </div>

        <div style={{padding:'24px 28px',flex:1}}>
          {redInc&&(
            <div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',borderRadius:8,padding:'10px 16px',display:'flex',alignItems:'center',gap:10,marginBottom:16,fontSize:'.8rem',color:'var(--red)'}}>
              🚨 <strong>CRITICAL ALERT:</strong>&nbsp;Red level — {redInc.location}. Evacuation protocols active.
            </div>
          )}

          {/* ══ DASHBOARD ══ */}
          {view==='dashboard'&&(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
                {[{label:'Total Devices',value:devices.length,color:'var(--accent)',top:'var(--accent)'},{label:'Online',value:online,color:'var(--green)',top:'var(--green)'},{label:'Active Alerts',value:activeAlerts,color:'var(--yellow)',top:'var(--yellow)'},{label:'Incidents Today',value:todayInc,color:'var(--red)',top:'var(--red)'}].map(s=>(
                  <div key={s.label} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 20px',position:'relative',overflow:'hidden'}}>
                    <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:s.top}}/>
                    <div style={{fontSize:'.7rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:8}}>{s.label}</div>
                    <div style={{fontSize:'2rem',fontWeight:700,fontFamily:'var(--mono)',color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:16}}>
                <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontWeight:600,fontSize:'.875rem'}}>Smoke Detector Status</span>
                    <span style={{fontSize:'.65rem',padding:'2px 8px',borderRadius:20,background:'rgba(0,194,255,.1)',color:'var(--accent)',border:'1px solid rgba(0,194,255,.2)',fontFamily:'var(--mono)'}}>LIVE</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',padding:'8px 20px',color:'var(--muted)',fontSize:'.65rem',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--mono)',borderBottom:'1px solid var(--border)'}}>
                    <span>Device</span><span>Location</span><span>Status</span><span>Threat</span><span>PM2.5</span>
                  </div>
                  <div style={{maxHeight:320,overflowY:'auto'}}>
                    {devices.map(d=>{
                      const latest=incidents.find(i=>i.device_id===d.device_id)
                      const threat=latest?.threat_level||'Gray'
                      const pm=parseFloat(latest?.pm25_value||'12.5')
                      return(
                        <div key={d.device_id} style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',fontSize:'.8rem'}}>
                          <div><div style={{fontWeight:500}}>{d.device_id}</div><div style={{color:'var(--muted)',fontSize:'.75rem'}}>{d.device_name}</div></div>
                          <div><div>{d.building}</div><div style={{color:'var(--muted)',fontSize:'.75rem'}}>{d.floor} · {d.room}</div></div>
                          <Badge status={d.status}/>
                          <ThreatBadge level={threat}/>
                          <div style={{fontFamily:'var(--mono)',fontSize:'.78rem',color:pmColor(pm)}}>{d.status==='Online'?pm.toFixed(1)+' µg/m³':'—'}</div>
                        </div>
                      )
                    })}
                    {devices.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>No devices registered.</div>}
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                    <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)'}}><span style={{fontWeight:600,fontSize:'.875rem'}}>Recent Alerts</span></div>
                    <div style={{maxHeight:200,overflowY:'auto'}}>
                      {incidents.slice(0,5).map(i=>{
                        const dc:Record<string,string>={Gray:'var(--gray)',Yellow:'var(--yellow)',Orange:'var(--orange)',Red:'var(--red)'}
                        return(
                          <div key={i.incident_id} style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:12,alignItems:'flex-start'}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:dc[i.threat_level]||'var(--gray)',marginTop:4,flexShrink:0}}/>
                            <div>
                              <div style={{fontSize:'.72rem',fontWeight:600,color:dc[i.threat_level]}}>{i.threat_level} — {i.device_id}</div>
                              <div style={{fontSize:'.75rem'}}>{i.location}</div>
                              <div style={{fontSize:'.68rem',color:'var(--muted)',fontFamily:'var(--mono)'}}>{timeAgo(i.created_at)}</div>
                            </div>
                          </div>
                        )
                      })}
                      {incidents.length===0&&<div style={{padding:16,color:'var(--muted)',fontSize:'.8rem'}}>No recent alerts</div>}
                    </div>
                  </div>
                  <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                    <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)'}}><span style={{fontWeight:600,fontSize:'.875rem'}}>Live Sensor Readings</span></div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,padding:'14px 16px'}}>
                      {devices.filter(d=>d.status==='Online').slice(0,4).map(d=>{
                        const latest=incidents.find(i=>i.device_id===d.device_id)
                        const pm=parseFloat(latest?.pm25_value||'12.5')
                        return(
                          <div key={d.device_id} style={{background:'var(--panel2)',borderRadius:8,padding:'12px 14px',border:'1px solid var(--border)'}}>
                            <div style={{fontSize:'.65rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{d.device_id}</div>
                            <div style={{fontSize:'1.4rem',fontWeight:700,fontFamily:'var(--mono)',color:pmColor(pm)}}>{pm.toFixed(1)}</div>
                            <div style={{fontSize:'.65rem',color:'var(--muted)'}}>µg/m³ PM2.5</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ CAMPUS MAP ══ */}
          {view==='map'&&(
            <div>
              <div style={{marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
                <div style={{fontSize:'.85rem',color:'var(--muted)'}}>All markers reflect live database data. Hover for details.</div>
                {redInc&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'8px 16px',fontSize:'.8rem',color:'var(--red)',display:'flex',alignItems:'center',gap:8}}>🚨 <strong>Evacuation route active</strong> — {redInc.location}</div>}
              </div>
              <CampusMap devices={devices} incidents={incidents} equipment={equipment}/>
              {incidents.filter(i=>!i.resolved&&i.threat_level!=='Gray').length>0&&(
                <div style={{marginTop:16,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                  <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',fontSize:'.875rem',fontWeight:600}}>Active Alerts on Map</div>
                  {incidents.filter(i=>!i.resolved&&i.threat_level!=='Gray').map(i=>(
                    <div key={i.incident_id} style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr',padding:'10px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',fontSize:'.8rem'}}>
                      <ThreatBadge level={i.threat_level}/>
                      <div style={{color:'var(--muted)'}}>{i.location}</div>
                      <div style={{fontFamily:'var(--mono)',fontSize:'.72rem'}}>{fmtTime(i.created_at)}</div>
                      <div style={{color:'var(--muted)',fontSize:'.75rem'}}>{(i.threat_level==='Orange'||i.threat_level==='Red')&&'🧯 Check nearest extinguisher'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ INCIDENTS ══ */}
          {view==='incidents'&&(
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
                <select onChange={e=>{setIncFilter(e.target.value);loadIncidents(e.target.value)}} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontFamily:'var(--font)',fontSize:'.82rem',width:160}}>
                  <option value=''>All Levels</option>
                  {['Gray','Yellow','Orange','Red'].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
                <div style={{flex:1}}/>
                <div style={{position:'relative'}}>
                  <button onClick={()=>setExportMenu(!exportMenu)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)',display:'flex',alignItems:'center',gap:6}}>
                    {exportLoading?'⏳ Exporting…':'⬇ Export ▾'}
                  </button>
                  {exportMenu&&(
                    <div style={{position:'absolute',right:0,top:'110%',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',zIndex:100,minWidth:180,boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
                      {[{label:'📊 Export as CSV',key:'csv'},{label:'📝 Export as TXT',key:'txt'},{label:'📄 Download as PDF',key:'pdf'},{label:'📃 Download as Word',key:'docx'}].map(item=>(
                        <div key={item.key} onClick={()=>handleExport(item.key)} style={{padding:'10px 16px',cursor:'pointer',fontSize:'.82rem',color:'var(--text)',borderBottom:'1px solid var(--border)'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='var(--panel2)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          {item.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr',padding:'8px 20px',color:'var(--muted)',fontSize:'.65rem',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--mono)',borderBottom:'1px solid var(--border)'}}>
                  <span>Time</span><span>Device</span><span>Location</span><span>Level</span><span>PM2.5</span><span>Status</span>
                </div>
                {incidents.map(i=>(
                  <div key={i.incident_id} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',fontSize:'.78rem'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:'.72rem'}}>{fmtTime(i.created_at)}</div>
                    <div>{i.device_id}</div>
                    <div style={{color:'var(--muted)'}}>{i.location}</div>
                    <ThreatBadge level={i.threat_level}/>
                    <div style={{fontFamily:'var(--mono)',color:pmColor(Number(i.pm25_value))}}>{i.pm25_value} µg/m³</div>
                    <Badge status={i.resolved?'Active':'Maintenance'}/>
                  </div>
                ))}
                {incidents.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>No incidents found.</div>}
              </div>
            </div>
          )}

          {/* ══ USERS ══ */}
          {view==='users'&&(
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
                <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="🔍  Search users..." style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 14px',color:'var(--text)',fontSize:'.82rem',outline:'none',width:240}}/>
                <div style={{flex:1}}/>
                <button onClick={()=>{setForm({user_type:'Security'});setFormErrors({});setModal('user')}} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>+ Add User</button>
              </div>
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1.5fr 1.2fr 1fr',padding:'8px 20px',color:'var(--muted)',fontSize:'.65rem',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--mono)',borderBottom:'1px solid var(--border)'}}>
                  <span>Name</span><span>Role</span><span>Email</span><span>Status</span><span>Actions</span>
                </div>
                {users.filter(u=>!userSearch||u.full_name.toLowerCase().includes(userSearch.toLowerCase())||u.username.toLowerCase().includes(userSearch.toLowerCase())).map(u=>(
                  <div key={u.user_id} style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1.5fr 1.2fr 1fr',padding:'12px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',fontSize:'.8rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:28,height:28,background:'linear-gradient(135deg,#0072ff,#00c2ff)',borderRadius:'50%',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{initials(u.full_name)}</div>
                      <div><div style={{fontWeight:500}}>{u.full_name}</div><div style={{color:'var(--muted)',fontSize:'.72rem',fontFamily:'var(--mono)'}}>@{u.username}</div></div>
                    </div>
                    <RoleBadge role={u.user_type}/>
                    <div style={{color:'var(--muted)',fontSize:'.75rem'}}>{u.email||'—'}</div>
                    <div>{u.is_verified?<span style={{fontSize:'.7rem',color:'var(--green)',fontWeight:600}}>✅ Active</span>:<span style={{fontSize:'.7rem',color:'var(--yellow)',fontWeight:600}}>⏳ Pending OTP</span>}</div>
                    <div style={{display:'flex',gap:6}}>
                      <button title="Change Role" onClick={()=>{setEditId(u.user_id);setForm({user_type:u.user_type});setFormErrors({});setModal('changeRole')}} style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontSize:'.9rem',padding:'3px 6px',borderRadius:4}}>🏷️</button>
                      <button title="Delete User" onClick={()=>{setDeleteTarget({type:'user',id:u.user_id,label:u.full_name});setModal('delete')}} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:'.9rem',padding:'3px 6px',borderRadius:4}}>🗑</button>
                    </div>
                  </div>
                ))}
                {users.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>No users found.</div>}
              </div>
              <div style={{marginTop:12,fontSize:'.75rem',color:'var(--muted)',padding:'0 4px'}}>ℹ️ Admin can only change user roles or delete accounts. Users manage their own profile and password from their sidebar.</div>
            </div>
          )}

          {/* ══ DEVICES ══ */}
          {view==='devices'&&(
            <div>
              <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
                <input value={devSearch} onChange={e=>setDevSearch(e.target.value)} placeholder="🔍  Search devices..." style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 14px',color:'var(--text)',fontSize:'.82rem',outline:'none',width:240}}/>
                <div style={{flex:1}}/>
                <button onClick={()=>{
                  const defaultBuilding='Medina Lacson Building'
                  const defaultRoom=ROOMS_BY_BUILDING[defaultBuilding][0]
                  setEditId(null)
                  setForm({building:defaultBuilding,roomKey:`${defaultRoom.floor}|${defaultRoom.room}`,status:'Online'})
                  setFormErrors({})
                  setModal('device')
                }} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>+ Add Device</button>
              </div>
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',padding:'8px 20px',color:'var(--muted)',fontSize:'.65rem',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--mono)',borderBottom:'1px solid var(--border)'}}>
                  <span>Device</span><span>Location</span><span>Status</span><span>Threat</span><span>Actions</span>
                </div>
                {devices.filter(d=>!devSearch||d.device_id.toLowerCase().includes(devSearch.toLowerCase())||d.building.toLowerCase().includes(devSearch.toLowerCase())).map(d=>{
                  const threat=incidents.find(i=>i.device_id===d.device_id)?.threat_level||'Gray'
                  return(
                    <div key={d.device_id} style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',fontSize:'.8rem'}}>
                      <div><div style={{fontWeight:500}}>{d.device_id}</div><div style={{color:'var(--muted)',fontSize:'.75rem'}}>{d.device_name}</div></div>
                      <div><div>{d.building}</div><div style={{color:'var(--muted)',fontSize:'.75rem'}}>{d.floor} · {d.room}</div></div>
                      <Badge status={d.status}/>
                      <ThreatBadge level={threat}/>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>{
                          setEditId(d.device_id)
                          setForm({device_id:d.device_id,device_name:d.device_name,building:d.building,roomKey:`${d.floor}|${d.room}`,status:d.status})
                          setFormErrors({})
                          setModal('device')
                        }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.9rem'}}>✏️</button>
                        <button onClick={()=>{setDeleteTarget({type:'device',id:d.device_id,label:d.device_id});setModal('delete')}} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:'.9rem'}}>🗑</button>
                      </div>
                    </div>
                  )
                })}
                {devices.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>No devices found.</div>}
              </div>
            </div>
          )}

          {/* ══ EQUIPMENT ══ */}
          {view==='equipment'&&(
            <div>
              <div style={{display:'flex',marginBottom:16}}>
                <div style={{flex:1}}/>
                <button onClick={()=>{
                  const defaultBuilding='Medina Lacson Building'
                  const defaultExt=EXT_LOCATIONS_BY_BUILDING[defaultBuilding][0]
                  setEditId(null)
                  setForm({equipment_type:'ABC',building:defaultBuilding,extKey:`${defaultExt.floor}|${defaultExt.desc}`,status:'Active',last_inspection:new Date().toISOString().split('T')[0]})
                  setFormErrors({})
                  setModal('equipment')
                }} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>+ Add Equipment</button>
              </div>
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 80px',padding:'8px 20px',color:'var(--muted)',fontSize:'.65rem',textTransform:'uppercase',letterSpacing:1,fontFamily:'var(--mono)',borderBottom:'1px solid var(--border)'}}>
                  <span>Type</span><span>Building</span><span>Location</span><span>Last Inspection</span><span>Status</span><span>Actions</span>
                </div>
                {equipment.map(e=>(
                  <div key={e.equipment_id} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr 1.5fr 1fr 1fr 80px',padding:'12px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',fontSize:'.8rem'}}>
                    <div style={{fontWeight:600}}>{e.equipment_type} <span style={{fontSize:'.7rem',color:'var(--muted)',fontWeight:400}}>Extinguisher</span></div>
                    <div>{e.building}</div>
                    <div style={{color:'var(--muted)'}}>{e.floor} · {e.location_description||'—'}</div>
                    <div style={{fontFamily:'var(--mono)',fontSize:'.75rem',color:'var(--muted)'}}>{e.last_inspection||'—'}</div>
                    <Badge status={e.status}/>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>{
                        setEditId(e.equipment_id)
                        setForm({equipment_type:e.equipment_type,building:e.building,extKey:`${e.floor}|${e.location_description}`,status:e.status,last_inspection:e.last_inspection||''})
                        setFormErrors({})
                        setModal('equipment')
                      }} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.9rem'}}>✏️</button>
                      <button onClick={()=>{setDeleteTarget({type:'equipment',id:e.equipment_id,label:e.equipment_type});setModal('delete')}} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:'.9rem'}}>🗑</button>
                    </div>
                  </div>
                ))}
                {equipment.length===0&&<div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>No equipment registered.</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ MODALS ══ */}
      {modal&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setModal(null)}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',backdropFilter:'blur(4px)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center'}}>

          {/* CREATE USER */}
          {modal==='user'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:500,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:600}}>Create User Account</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22}}>
                <div style={{background:'rgba(0,194,255,.08)',border:'1px solid rgba(0,194,255,.2)',borderRadius:6,padding:'10px 14px',fontSize:'.78rem',color:'var(--accent)',marginBottom:16}}>
                  📧 An OTP will be sent to the user's email. They must verify and set their own password before the account becomes active.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <div>{lbl('Full Name')}{input('full_name','Juan Dela Cruz')}</div>
                  <div>{lbl('Username')}{input('username','jdelacruz')}</div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <div>
                    {lbl('Role')}
                    <select value={form.user_type||'Security'} onChange={e=>setForm({...form,user_type:e.target.value})} style={{width:'100%',background:'var(--panel2)',border:'1px solid var(--border)',borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                      {['Admin','Security','DRRM','Campus Personnel'].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>{lbl('Phone (optional)')}{input('phone','09123456789')}</div>
                </div>
                <div>{lbl('Email (required — OTP will be sent here)')}{input('email','user@bpsu.edu.ph','email')}</div>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={saveUser} disabled={otpLoading} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',opacity:otpLoading?.6:1}}>
                  {otpLoading?'Sending OTP…':'Create & Send OTP'}
                </button>
              </div>
            </div>
          )}

          {/* CHANGE ROLE */}
          {modal==='changeRole'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:360,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:600}}>Change User Role</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22}}>
                <div style={{background:'rgba(249,115,22,.08)',border:'1px solid rgba(249,115,22,.2)',borderRadius:6,padding:'8px 12px',fontSize:'.75rem',color:'var(--orange)',marginBottom:16}}>
                  ⚠️ Admins can only change the user's role. Profile and password are managed by the user themselves.
                </div>
                {lbl('New Role')}
                <select value={form.user_type||'Security'} onChange={e=>setForm({...form,user_type:e.target.value})} style={{width:'100%',background:'var(--panel2)',border:'1px solid var(--border)',borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                  {['Admin','Security','DRRM','Campus Personnel'].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={saveRole} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>Save Role</button>
              </div>
            </div>
          )}

          {/* SELF EDIT */}
          {modal==='selfEdit'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:460,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:600}}>Edit My Profile</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <div>{lbl('Full Name')}{input('full_name','Juan Dela Cruz')}</div>
                  <div>{lbl('Username')}{input('username','jdelacruz')}</div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>{lbl('Email')}{input('email','email@bpsu.edu.ph','email')}</div>
                  <div>{lbl('Phone')}{input('phone','09123456789')}</div>
                </div>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={saveSelfProfile} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>Save Profile</button>
              </div>
            </div>
          )}

          {/* CHANGE PASSWORD */}
          {modal==='changePassword'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:400,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:600}}>Change Password</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22,display:'flex',flexDirection:'column',gap:14}}>
                <div>{lbl('Current Password')}{input('current_password','••••••••','password')}</div>
                <div>{lbl('New Password (min 8 chars)')}{input('new_password','••••••••','password')}</div>
                <div>{lbl('Confirm New Password')}{input('confirm_password','••••••••','password')}</div>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={changePassword} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>Change Password</button>
              </div>
            </div>
          )}

          {/* DEVICE MODAL — no Floor field, single Room dropdown */}
          {modal==='device'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:480,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:600}}>{editId?'Edit Device':'Add Device'}</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <div>{lbl('Device ID')}{input('device_id','AG-009','text',!!editId)}</div>
                  <div>{lbl('Device Name')}{input('device_name','AeroGuard Unit 9')}</div>
                </div>
                <div style={{marginBottom:14}}>
                  {lbl('Building')}
                  <select value={form.building||'Medina Lacson Building'}
                    onChange={e=>{
                      const b=e.target.value
                      const firstRoom=ROOMS_BY_BUILDING[b]?.[0]
                      setForm({...form, building:b, roomKey: firstRoom?`${firstRoom.floor}|${firstRoom.room}`:''})
                      setFormErrors({...formErrors, building:'', roomKey:''})
                    }}
                    style={{width:'100%',background:'var(--panel2)',border:`1px solid ${formErrors.building?'var(--red)':'var(--border)'}`,borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                    {BUILDINGS_LIST.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                  {formErrors.building&&<div style={{color:'var(--red)',fontSize:'.7rem',marginTop:3}}>⚠ {formErrors.building}</div>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
                  <div>
                    {lbl('Room')}
                    <select value={form.roomKey||(currentRoomOptions[0]?`${currentRoomOptions[0].floor}|${currentRoomOptions[0].room}`:'')}
                      onChange={e=>{setForm({...form,roomKey:e.target.value});setFormErrors({...formErrors,roomKey:''})}}
                      style={{width:'100%',background:'var(--panel2)',border:`1px solid ${formErrors.roomKey?'var(--red)':'var(--border)'}`,borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                      {currentRoomOptions.map(r=><option key={`${r.floor}|${r.room}`} value={`${r.floor}|${r.room}`}>{r.label}</option>)}
                    </select>
                    {formErrors.roomKey&&<div style={{color:'var(--red)',fontSize:'.7rem',marginTop:3}}>⚠ {formErrors.roomKey}</div>}
                  </div>
                  <div>
                    {lbl('Status')}
                    <select value={form.status||'Online'} onChange={e=>setForm({...form,status:e.target.value})}
                      style={{width:'100%',background:'var(--panel2)',border:'1px solid var(--border)',borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                      {['Online','Offline','Maintenance'].map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginTop:12,fontSize:'.75rem',color:'var(--muted)'}}>💡 Each room can only hold one device. Occupied rooms will show an error.</div>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={saveDevice} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>Save Device</button>
              </div>
            </div>
          )}

          {/* EQUIPMENT MODAL — single Location dropdown (includes floor) */}
          {modal==='equipment'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:480,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:'1rem',fontWeight:600}}>{editId?'Edit Fire Equipment':'Add Fire Equipment'}</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <div>
                    {lbl('Type')}
                    <select value={form.equipment_type||'ABC'} onChange={e=>setForm({...form,equipment_type:e.target.value})}
                      style={{width:'100%',background:'var(--panel2)',border:`1px solid ${formErrors.equipment_type?'var(--red)':'var(--border)'}`,borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                      {['ABC','CO2','Water','Foam'].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.equipment_type&&<div style={{color:'var(--red)',fontSize:'.7rem',marginTop:3}}>⚠ {formErrors.equipment_type}</div>}
                  </div>
                  <div>
                    {lbl('Status')}
                    <select value={form.status||'Active'} onChange={e=>setForm({...form,status:e.target.value})}
                      style={{width:'100%',background:'var(--panel2)',border:'1px solid var(--border)',borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                      {['Active','Maintenance','Expired'].map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:14}}>
                  {lbl('Building')}
                  <select value={form.building||'Medina Lacson Building'}
                    onChange={e=>{
                      const b=e.target.value
                      const firstExt=EXT_LOCATIONS_BY_BUILDING[b]?.[0]
                      setForm({...form, building:b, extKey: firstExt?`${firstExt.floor}|${firstExt.desc}`:''})
                      setFormErrors({...formErrors, building:'', extKey:''})
                    }}
                    style={{width:'100%',background:'var(--panel2)',border:`1px solid ${formErrors.building?'var(--red)':'var(--border)'}`,borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                    {BUILDINGS_LIST.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                  {formErrors.building&&<div style={{color:'var(--red)',fontSize:'.7rem',marginTop:3}}>⚠ {formErrors.building}</div>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:14}}>
                  <div>
                    {lbl('Location (map slot)')}
                    <select value={form.extKey||(currentExtOptions[0]?`${currentExtOptions[0].floor}|${currentExtOptions[0].desc}`:'')}
                      onChange={e=>{setForm({...form,extKey:e.target.value});setFormErrors({...formErrors,extKey:''})}}
                      style={{width:'100%',background:'var(--panel2)',border:`1px solid ${formErrors.extKey?'var(--red)':'var(--border)'}`,borderRadius:6,padding:'9px 12px',color:'var(--text)',fontSize:'.85rem',fontFamily:'var(--font)',outline:'none'}}>
                      {currentExtOptions.map(l=><option key={`${l.floor}|${l.desc}`} value={`${l.floor}|${l.desc}`}>{l.label}</option>)}
                    </select>
                    {formErrors.extKey&&<div style={{color:'var(--red)',fontSize:'.7rem',marginTop:3}}>⚠ {formErrors.extKey}</div>}
                  </div>
                  <div>{lbl('Last Inspection Date')}{input('last_inspection','','date')}</div>
                </div>
                <div style={{marginTop:4,fontSize:'.75rem',color:'var(--muted)'}}>💡 Each map location can only hold one extinguisher. Occupied slots will show an error.</div>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={saveEquipment} style={{padding:'8px 18px',background:'var(--accent2)',color:'white',border:'none',borderRadius:6,fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>{editId?'Update Equipment':'Save Equipment'}</button>
              </div>
            </div>
          )}

          {/* DELETE */}
          {modal==='delete'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:380,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
                <div style={{fontWeight:600}}>Confirm Delete</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:22,color:'var(--gray)',fontSize:'.875rem'}}>
                Delete <strong>"{deleteTarget?.label}"</strong>? This cannot be undone.
                {deleteTarget?.type==='device'&&<div style={{marginTop:8,color:'var(--red)',fontSize:'.8rem'}}>⚠ All incident records linked to this device will also be deleted.</div>}
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Cancel</button>
                <button onClick={confirmDelete} style={{padding:'8px 18px',background:'rgba(239,68,68,.15)',border:'1px solid rgba(239,68,68,.3)',borderRadius:6,color:'var(--red)',fontSize:'.8rem',fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'}}>Delete</button>
              </div>
            </div>
          )}

          {/* ACCESS DENIED */}
          {modal==='access'&&(
            <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:12,width:380,maxWidth:'95vw',overflow:'hidden'}}>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
                <div style={{fontWeight:600}}>Access Restricted</div>
                <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}}>✕</button>
              </div>
              <div style={{padding:'32px 22px',textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:12}}>🔒</div>
                <div style={{fontSize:'1rem',fontWeight:600,marginBottom:8}}>Admin Access Only</div>
                <p style={{color:'var(--muted)',fontSize:'.85rem'}}>This section is only available to <strong style={{color:'var(--accent)'}}>Admin</strong> accounts.</p>
              </div>
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'center'}}>
                <button onClick={()=>setModal(null)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--muted)',fontSize:'.8rem',cursor:'pointer',fontFamily:'var(--font)'}}>Go Back</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOAST */}
      {toast&&(
        <div style={{position:'fixed',bottom:24,right:24,zIndex:9999}}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 16px',fontSize:'.8rem',minWidth:300,display:'flex',alignItems:'center',gap:10,boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
            <div>{toast.type==='success'?'✅':toast.type==='error'?'❌':'ℹ️'}</div>
            <div><div style={{fontWeight:600}}>{toast.title}</div><div style={{color:'var(--muted)',fontSize:'.72rem'}}>{toast.msg}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}