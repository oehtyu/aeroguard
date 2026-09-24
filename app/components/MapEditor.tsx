'use client'

import { PointerEvent, RefObject, useEffect, useRef, useState } from 'react'
import { assignSafeZones, planEvacuation } from './evacuation'
import { nearestExtinguishers, resolveEquipmentPoint, sameBuilding } from './extinguishers'

export type MapObject = {
  map_object_id: number
  object_type: 'building' | 'room' | 'tree_area' | 'wall' | 'gate' | 'safe_zone' | 'area'
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
  parent_id: number | null
  parent_name?: string | null
  floor?: string | null
  pin_x?: number | null
  pin_y?: number | null
}

const CANVAS_W = 1140
const CANVAS_H = 600
const COLORS = ['#1e3a5f', '#2d1e5f', '#3a1a2f', '#14532d', '#166534', '#475569', '#f97316', '#ef4444']
const LABELS: Record<MapObject['object_type'], string> = {
  building: 'Building', room: 'Room', tree_area: 'Green Area', wall: 'Wall',
  gate: 'Gate', safe_zone: 'Assembly Area', area: 'Area',
}

const numberValue = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export { sameBuilding }

export function normaliseObject(object: MapObject): MapObject {
  return {
    ...object,
    map_object_id: numberValue(object.map_object_id, 0),
    parent_id: object.parent_id == null ? null : numberValue(object.parent_id, 0),
    x: numberValue(object.x, 0), y: numberValue(object.y, 0),
    width: numberValue(object.width, 140), height: numberValue(object.height, 80),
  }
}

function centerOf(o: MapObject) { return { cx: o.x + o.width / 2, cy: o.y + o.height / 2 } }

// The flag/route target for a safe_zone: its own draggable pin if one has
// been placed, otherwise the zone's geometric center as a sane default.
function pinOf(o: MapObject) {
  return { cx: o.pin_x ?? (o.x + o.width / 2), cy: o.pin_y ?? (o.y + o.height / 2) }
}

// The assembly area a building belongs to: the zone whose rectangle contains it, else the
// nearest zone rectangle (see assignSafeZones). Follows the map as admins reshape it.
export function findNearestSafeZone(building: MapObject | undefined | null, allObjects: MapObject[]): MapObject | null {
  if (!building) return null
  return assignSafeZones(building, null, allObjects)[0] ?? null
}

type CanvasProps = {
  objects: MapObject[]
  devices?: any[]
  incidents?: any[]
  equipment?: any[]
  selectedId?: number | null
  canvasRef?: RefObject<HTMLDivElement>
    onPointerDown?: (event: PointerEvent<HTMLDivElement>, object: MapObject, resize?: boolean, pin?: boolean) => void
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void
  // Editor only: start dragging an extinguisher, and positions dragged this session.
  onEquipmentPointerDown?: (event: PointerEvent<HTMLDivElement>, item: any, building: MapObject) => void
  equipmentOffsets?: Record<string, { x: number; y: number }>
  // true only inside the admin Map Editor. Controls two things: Assembly
  // Area blocks render faint/see-through (so the admin can see what's
  // underneath while positioning a large zone) instead of the compact pin
  // shown to everyone else, and pointer handlers are wired up at all.
  isEditor?: boolean
  // Editor only: the building a new room is about to be added to. It glows so the admin
  // can tell identically-named buildings apart.
  highlightId?: number | null
}

export function MapCanvas({ objects, devices = [], incidents = [], equipment = [], selectedId, canvasRef, onPointerDown, onPointerMove, onPointerUp, onEquipmentPointerDown, equipmentOffsets = {}, isEditor = false, highlightId = null }: CanvasProps) {
  const display = objects.map(normaliseObject)
  const activeByDevice = new Map(incidents.filter(incident => !incident.resolved).map(incident => [incident.device_id, incident]))
  // Assembly Areas render as a compact pin outside the editor, so they
  // don't crowd the map for everyone who isn't repositioning them.
  const ordered = [...display]
    .filter(object => isEditor || object.object_type !== 'safe_zone')
    .sort((a, b) => (a.object_type === 'room' ? 1 : 0) - (b.object_type === 'room' ? 1 : 0))
  const safeZonesForPins = isEditor ? [] : display.filter(object => object.object_type === 'safe_zone')

  // Live evacuation route(s): for every device currently in an Orange/Red
  // incident, find its building, find the nearest Assembly Area, and draw
  // a line between them. Fully dynamic — no hardcoded gates or routes.
    function countBuildingHits(points: { cx: number; cy: number }[], excludeId: number) {
    let hits = 0
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = [points[i].cx, points[i].cy]
      const [x2, y2] = [points[i + 1].cx, points[i + 1].cy]
      const segMinX = Math.min(x1, x2), segMaxX = Math.max(x1, x2)
      const segMinY = Math.min(y1, y2), segMaxY = Math.max(y1, y2)
      for (const b of display) {
        if (b.object_type !== 'building' || b.map_object_id === excludeId) continue
        const overlapX = segMaxX > b.x && segMinX < b.x + b.width
        const overlapY = segMaxY > b.y && segMinY < b.y + b.height
        if (overlapX && overlapY) hits++
      }
    }
    return hits
  }
  // Two-segment "L" route instead of one diagonal line — bends at whichever
  // corner crosses fewer other buildings, so it reads more like a real path
  // through campus than a line cutting straight through walls.
  function bentRoute(from: { cx: number; cy: number }, to: { cx: number; cy: number }, excludeId: number) {
    const viaA = { cx: to.cx, cy: from.cy }   // horizontal first, then vertical
    const viaB = { cx: from.cx, cy: to.cy }   // vertical first, then horizontal
    const hitsA = countBuildingHits([from, viaA, to], excludeId)
    const hitsB = countBuildingHits([from, viaB, to], excludeId)
    const via = hitsA <= hitsB ? viaA : viaB
    return [from, via, to]
  }

  const activeRoutes = devices.flatMap(device => {
    const incident = activeByDevice.get(device.device_id) as any
    if (!incident || (incident.threat_level !== 'Orange' && incident.threat_level !== 'Red')) return []
    const building = display.find(o => o.object_type === 'building' && o.name === device.building)
    if (!building) return []
    const room = display.find(o => o.object_type === 'room' && o.parent_name === device.building && o.name === device.room && (!device.floor || !o.floor || o.floor === device.floor))

    // Preferred: a real path around buildings and walls to the nearest reachable Assembly Area.
    const plan = planEvacuation(building, room, display)
    if (plan) return [{ device_id: device.device_id, threat_level: incident.threat_level, points: plan.points, safeZoneName: plan.safeZone.name }]

    // Fallback (no assembly area is reachable): the old straight L-shaped hint.
    const safeZone = findNearestSafeZone(building, display)
    if (!safeZone) return []
    const points = bentRoute(centerOf(building), pinOf(safeZone), building.map_object_id)
    return [{ device_id: device.device_id, threat_level: incident.threat_level, points, safeZoneName: safeZone.name }]
  })

  // While a room is in an Orange/Red alert, number the 3 nearest AVAILABLE extinguishers
  // (1 = nearest) so people can see where to go. Maintenance/Expired units are never numbered.
  const extRanks = new Map<string, number>()
  devices.forEach(device => {
    const incident = activeByDevice.get(device.device_id) as any
    if (!incident || (incident.threat_level !== 'Orange' && incident.threat_level !== 'Red')) return
    const room = display.find(o => o.object_type === 'room' && o.parent_name === device.building && o.name === device.room && (!device.floor || !o.floor || o.floor === device.floor))
    nearestExtinguishers({ buildingName: device.building, floor: device.floor, room, objects: display, equipment }).usable.forEach(n => {
      const key = String(n.item.equipment_id)
      extRanks.set(key, Math.min(extRanks.get(key) ?? 99, n.rank))
    })
  })

  return (
    // Outer wrapper is the actual scrollable/pannable viewport — this is
    // what fixes mobile: instead of shrinking the whole map to fit a
    // narrow screen (making text illegible), the map stays at a fixed,
    // always-readable size and the wrapper scrolls/pans to reach the rest.
    <div style={{ width: '100%', maxHeight: '70vh', overflow: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)', borderRadius: 10, background: '#0d1421' }}>
           <div ref={canvasRef} data-map-canvas onPointerMove={isEditor ? onPointerMove : undefined} onPointerUp={isEditor ? onPointerUp : undefined} onPointerCancel={isEditor ? onPointerUp : undefined}
        style={{ width: CANVAS_W, height: CANVAS_H, position: 'relative', background: '#0d1421', touchAction: isEditor ? 'none' : 'auto', userSelect: 'none' }}>
        <style>{`
          .aeg-ping{position:absolute;left:50%;top:50%;width:100%;height:100%;box-sizing:border-box;border:2px solid #22c55e;border-radius:50%;pointer-events:none;opacity:0;transform:translate(-50%,-50%);animation:aegPing 1.8s ease-out infinite}
          @keyframes aegPing{0%{transform:translate(-50%,-50%) scale(1);opacity:.9}100%{transform:translate(-50%,-50%) scale(3.4);opacity:0}}
          @keyframes aegTarget{0%,100%{box-shadow:0 0 0 3px rgba(250,204,21,.95),0 0 10px 2px rgba(250,204,21,.45)}50%{box-shadow:0 0 0 3px rgba(250,204,21,.95),0 0 26px 8px rgba(250,204,21,.85)}}
          @media (prefers-reduced-motion:reduce){.aeg-target{animation:none!important}}
          @media (prefers-reduced-motion:reduce){.aeg-ping{animation:none;opacity:.55;transform:translate(-50%,-50%) scale(1.8)}}
        `}</style>
        {ordered.map(object => {
          const isRoom = object.object_type === 'room'
          const isSafeZone = object.object_type === 'safe_zone'
          const selected = object.map_object_id === selectedId
          const isTarget = isEditor && object.object_type === 'building' && object.map_object_id === highlightId
          return (
            <div key={object.map_object_id} className={isTarget ? 'aeg-target' : undefined} onPointerDown={event => isEditor && onPointerDown?.(event, object)}
              style={{ position: 'absolute', left: object.x, top: object.y, width: object.width, height: object.height,
                boxSizing: 'border-box',
                background: object.object_type === 'wall' ? object.color : isRoom ? '#334155' : isSafeZone ? `${object.color}26` : `${object.color}99`,
                border: isTarget ? '2px solid #facc15' : `${selected ? 2 : 1}px solid ${selected ? '#00c2ff' : object.color}`,
                borderStyle: isSafeZone ? 'dashed' : 'solid',
                animation: isTarget ? 'aegTarget 1.2s ease-in-out infinite' : undefined,
                boxShadow: isTarget ? '0 0 0 3px rgba(250,204,21,.95), 0 0 14px 3px rgba(250,204,21,.6)' : undefined,
                borderRadius: object.object_type === 'wall' ? 1 : 4, zIndex: isRoom ? 3 : isSafeZone ? 0 : isTarget ? 2 : 1,
                cursor: isEditor && onPointerDown ? 'grab' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: isRoom ? 11 : 13, fontWeight: 700, overflow: 'visible' }}>
              <span style={{ pointerEvents: 'none', textAlign: 'center', padding: 3 }}>{object.name}</span>
              {isTarget && <span style={{ position: 'absolute', left: 4, top: -9, zIndex: 4, pointerEvents: 'none', background: '#facc15', color: '#0d1421', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>NEW ROOM GOES HERE</span>}
              {selected && isEditor && onPointerDown && <div onPointerDown={event => { event.stopPropagation(); onPointerDown(event, object, true) }}
                style={{ position: 'absolute', width: 11, height: 11, right: -6, bottom: -6, background: '#00c2ff', border: '2px solid #fff', borderRadius: 2, cursor: 'nwse-resize' }} />}
            </div>
          )
        })}
                {safeZonesForPins.map(zone => {
          const c = pinOf(zone)
          return (
            <div key={`pin-${zone.map_object_id}`} title={`Assembly Area: ${zone.name}`} style={{ position: 'absolute', left: c.cx, top: c.cy, transform: 'translate(-50%, -100%)', zIndex: 5, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 22, filter: 'drop-shadow(0 0 3px rgba(0,0,0,.6))' }}>🚩</div>
              <div style={{ background: 'rgba(13,20,33,.85)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', marginTop: -2 }}>{zone.name}</div>
            </div>
          )
        })}
        {isEditor && ordered.filter(o => o.object_type === 'safe_zone' && o.map_object_id === selectedId).map(zone => {
          const c = pinOf(zone)
          return (
            <div key={`editor-pin-${zone.map_object_id}`} onPointerDown={event => onPointerDown?.(event, zone, false, true)}
              title="Drag to reposition the flag"
              style={{ position: 'absolute', left: c.cx, top: c.cy, transform: 'translate(-50%, -100%)', zIndex: 8, cursor: 'grab', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 26, filter: 'drop-shadow(0 0 4px rgba(0,194,255,.9))' }}>🚩</div>
            </div>
          )
        })}

        {devices.map(device => {
          const room = display.find(object => object.object_type === 'room' && object.parent_name === device.building && object.name === device.room && (!device.floor || !object.floor || object.floor === device.floor))
          if (!room) return null
          const incident = activeByDevice.get(device.device_id) as any
          const color = incident?.threat_level === 'Red' ? '#ef4444' : incident?.threat_level === 'Orange' ? '#f97316' : '#00c2ff'
          return <div key={device.device_id} title={`${device.device_id} — ${device.device_name || 'Smoke detector'}`} style={{ position: 'absolute', left: room.x + room.width / 2, top: room.y + room.height / 2, transform: 'translate(-50%, -50%)', width: 24, height: 24, borderRadius: '50%', background: color, border: '2px solid white', zIndex: 5, display: 'grid', placeItems: 'center', fontSize: 12, pointerEvents: 'none', boxShadow: `0 0 0 3px ${color}33` }}>📡</div>
        })}
        {equipment.map((item, index) => {
          const point = resolveEquipmentPoint(item, display, equipment, equipmentOffsets)
          if (!point) return null
          const { x: markerX, y: markerY, placed, building } = point
          const rank = extRanks.get(String(item.equipment_id))   // set for the 3 nearest available ones while an alert is active
          const statusColor = item.status === 'Expired' ? '#ef4444' : item.status === 'Maintenance' ? '#eab308' : '#f97316'

          return (
            <div
              key={`extinguisher-${item.equipment_id || index}`}
              title={`${rank ? `#${rank} nearest available extinguisher | ` : ''}Extinguisher: ${item.equipment_type || 'ABC'} | ${item.building} | ${item.floor || ''} ${item.location_description || ''} | ${item.status || 'Active'}${isEditor ? (placed ? ' | drag to move' : ' | not placed yet - drag it to its exact spot') : ''}`}
              onPointerDown={event => isEditor && onEquipmentPointerDown?.(event, item, building)}
              style={{
                position: 'absolute', left: markerX, top: markerY, transform: 'translate(-50%, -50%)',
                width: 23, height: 23, borderRadius: 5, background: rank ? '#16a34a' : statusColor,
                border: isEditor && !placed ? '2px dashed white' : '2px solid white',
                zIndex: rank ? 9 : 7, display: 'grid', placeItems: 'center', fontSize: 13,
                cursor: isEditor ? 'grab' : 'default', touchAction: 'none',
                boxShadow: rank ? '0 0 0 3px #22c55e' : `0 0 0 3px ${statusColor}33`,
              }}
            >
              🧯
              {rank ? (
                <>
                  {/* green "signal" pulses out of the extinguishers people should head to */}
                  <span className="aeg-ping" aria-hidden style={{ animationDelay: '0s' }} />
                  <span className="aeg-ping" aria-hidden style={{ animationDelay: '0.9s' }} />
                </>
              ) : null}
            </div>
          )
        })}
                {activeRoutes.map(route => {
          const color = route.threat_level === 'Red' ? '#ef4444' : '#f97316'
          const pointsAttr = route.points.map((p: any) => `${p.cx},${p.cy}`).join(' ')
          const last = route.points[route.points.length - 1]
          return (
            <svg key={`route-${route.device_id}`} style={{ position: 'absolute', inset: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: 'none', zIndex: 4 }}>
              <polyline points={pointsAttr} fill="none" stroke={color} strokeWidth={4} strokeDasharray="10 6" opacity={0.9} strokeLinejoin="round" />
              <circle cx={last.cx} cy={last.cy} r={10} fill={color} opacity={0.9} />
            </svg>
          )
        })}
      </div>
    </div>
  )
}

type Interaction = {
  id: number
  resize: boolean
  pin?: boolean
  startX: number
  startY: number
  item: MapObject
  pointerId: number
  children: MapObject[]
}


export default function MapEditor({ initialObjects, adminId, onChanged, onEquipmentChanged, devices = [], incidents = [], equipment = [] }: { initialObjects: MapObject[]; adminId: number; onChanged: () => Promise<void> | void; onEquipmentChanged?: () => Promise<void> | void; devices?: any[]; incidents?: any[]; equipment?: any[] }) {
  // Important: this is deliberately a local editor copy. It must NOT be reset
  // by Dashboard's live refresh while the user is dragging.
  const [objects, setObjects] = useState<MapObject[]>(() => initialObjects.map(normaliseObject))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newType, setNewType] = useState<MapObject['object_type']>('building')
  const [newName, setNewName] = useState('')
  const [newFloor, setNewFloor] = useState('1F')
  const [newParent, setNewParent] = useState<number | ''>('')
  const [message, setMessage] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  const objectsRef = useRef<MapObject[]>(initialObjects.map(normaliseObject))
  const interaction = useRef<Interaction | null>(null)
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve())

  // Extinguisher placement. Positions are stored relative to the building's
  // top-left corner, so an extinguisher stays put inside its building if the
  // building is later moved.
  const [extOffsets, setExtOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const extDrag = useRef<{ id: string; buildingId: number; startX: number; startY: number; baseX: number; baseY: number; last: { x: number; y: number } } | null>(null)

  function beginExt(event: PointerEvent<HTMLDivElement>, item: any, building: MapObject) {
    event.preventDefault(); event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width, scaleY = CANVAS_H / rect.height
    // where the marker is drawn right now (its centre), in map coordinates
    const el = event.currentTarget.getBoundingClientRect()
    const cx = (el.left + el.width / 2 - rect.left) * scaleX
    const cy = (el.top + el.height / 2 - rect.top) * scaleY
    canvas.setPointerCapture(event.pointerId)
    const base = { x: cx - building.x, y: cy - building.y }
    extDrag.current = {
      id: String(item.equipment_id), buildingId: building.map_object_id,
      startX: (event.clientX - rect.left) * scaleX, startY: (event.clientY - rect.top) * scaleY,
      baseX: base.x, baseY: base.y, last: base,
    }
  }

  const replaceObjects = (updater: MapObject[] | ((current: MapObject[]) => MapObject[])) => {
    setObjects(current => {
      const next = typeof updater === 'function' ? updater(current) : updater
      objectsRef.current = next
      return next
    })
  }
  const selected = objects.find(object => object.map_object_id === selectedId) || null
  const buildings = objects.filter(object => object.object_type === 'building')
  // The building a new room will be added to (falls back to the first building, exactly like the
  // dropdown displays). Drives the glow on the map, the dropdown, and addObject().
  const targetBuildingId = newType === 'room'
    ? (buildings.find(b => b.map_object_id === newParent)?.map_object_id ?? buildings[0]?.map_object_id ?? null)
    : null

  async function request(method: 'POST' | 'PUT' | 'DELETE', body: any) {
    const response = await fetch('/api/map', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, ...body }) })
    const data = await response.json()
    if (!data.success) throw new Error(data.message || 'Map change failed.')
    return data
  }
  function enqueue<T>(work: () => Promise<T>) {
    const next = writeQueue.current.then(work, work)
    writeQueue.current = next.catch(() => undefined)
    return next
  }

    function begin(event: PointerEvent<HTMLDivElement>, object: MapObject, resize = false, pin = false) {
    event.preventDefault(); event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.setPointerCapture(event.pointerId)
    interaction.current = { id: object.map_object_id, resize, pin, startX: (event.clientX - rect.left) * CANVAS_W / rect.width, startY: (event.clientY - rect.top) * CANVAS_H / rect.height, item: normaliseObject(object), pointerId: event.pointerId, children: object.object_type === 'building' ? objectsRef.current.filter(item => item.parent_id === object.map_object_id).map(normaliseObject) : [] }
    setSelectedId(object.map_object_id)
    // While adding a room, clicking a building on the map picks it as that room's building.
    if (newType === 'room' && object.object_type === 'building' && !resize && !pin) setNewParent(object.map_object_id)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current
    const ext = extDrag.current
    if (ext && canvas) {
      const rect = canvas.getBoundingClientRect()
      const building = objectsRef.current.find(o => o.map_object_id === ext.buildingId)
      if (!building) return
      const dx = (event.clientX - rect.left) * CANVAS_W / rect.width - ext.startX
      const dy = (event.clientY - rect.top) * CANVAS_H / rect.height - ext.startY
      // may sit just outside the wall (e.g. beside an exit door), but not far away
      ext.last = { x: clamp(ext.baseX + dx, -24, building.width + 24), y: clamp(ext.baseY + dy, -24, building.height + 24) }
      setExtOffsets(current => ({ ...current, [ext.id]: ext.last }))
      return
    }
    const active = interaction.current
    if (!active || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = (event.clientX - rect.left) * CANVAS_W / rect.width - active.startX
    const dy = (event.clientY - rect.top) * CANVAS_H / rect.height - active.startY
        replaceObjects(current => {
      const parent = active.item.object_type === 'room' ? current.find(item => item.map_object_id === active.item.parent_id) : null
      const x = clamp(active.item.x + dx, 0, CANVAS_W - active.item.width)
      const y = clamp(active.item.y + dy, 0, CANVAS_H - active.item.height)
      return current.map(item => {
        if (item.map_object_id === active.id) {
          if (active.pin) {
            const basePinX = active.item.pin_x ?? (active.item.x + active.item.width / 2)
            const basePinY = active.item.pin_y ?? (active.item.y + active.item.height / 2)
            return { ...item, pin_x: clamp(basePinX + dx, 0, CANVAS_W), pin_y: clamp(basePinY + dy, 0, CANVAS_H) }
          }
          if (active.resize) {
            const minWidth = active.item.object_type === 'building' ? Math.max(20, ...active.children.map(child => child.x + child.width - active.item.x)) : 20
            const minHeight = active.item.object_type === 'building' ? Math.max(20, ...active.children.map(child => child.y + child.height - active.item.y)) : 20
            const maxWidth = parent ? parent.x + parent.width - active.item.x : CANVAS_W - active.item.x
            const maxHeight = parent ? parent.y + parent.height - active.item.y : CANVAS_H - active.item.y
            return { ...item, width: clamp(active.item.width + dx, minWidth, maxWidth), height: clamp(active.item.height + dy, minHeight, maxHeight) }
          }
          if (parent) return { ...item, x: clamp(active.item.x + dx, parent.x, parent.x + parent.width - active.item.width), y: clamp(active.item.y + dy, parent.y, parent.y + parent.height - active.item.height) }
          return { ...item, x, y }
        }
        const originalChild = active.children.find(child => child.map_object_id === item.map_object_id)
        if (!originalChild) return item
        // Buildings carry rooms with them, and this clamps any previously bad
        // room position inside the new building boundary.
        const relativeX = clamp(originalChild.x - active.item.x, 0, Math.max(0, active.item.width - item.width))
        const relativeY = clamp(originalChild.y - active.item.y, 0, Math.max(0, active.item.height - item.height))
        return { ...item, x: x + relativeX, y: y + relativeY }
      })
    })
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const ext = extDrag.current
    if (ext) {
      extDrag.current = null
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
      const pos = { x: Math.round(ext.last.x * 10) / 10, y: Math.round(ext.last.y * 10) / 10 }
      void enqueue(async () => {
        const response = await fetch('/api/equipment', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: adminId, equipment_id: Number(ext.id), position_only: true, map_x: pos.x, map_y: pos.y }),
        })
        const data = await response.json()
        if (!data.success) throw new Error(data.message || 'Could not save the extinguisher position.')
        setMessage('Extinguisher position saved.'); void onEquipmentChanged?.()
      }).catch((error: any) => {
        setMessage(error.message)
        setExtOffsets(current => { const next = { ...current }; delete next[ext.id]; return next })
      })
      return
    }
    const active = interaction.current
    if (!active) return
    interaction.current = null
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    const changedIds = [active.id, ...active.children.map(child => child.map_object_id)]
    const changed = objectsRef.current.filter(item => changedIds.includes(item.map_object_id))
    // Saving is intentionally queued after the pointer is released. No fetch,
    // prop replacement, or dashboard reload occurs during pointer movement.
    void enqueue(async () => {
      await Promise.all(changed.map(item => request('PUT', item)))
      setMessage('Saved.'); void onChanged()
    }).catch((error: any) => setMessage(error.message))
  }

  // Where a new room first appears: inside its own building, in the first free spot, so it never
  // lands somewhere else on the map (and never snaps back the first time it is dragged or resized).
  function roomSpawnBox(parent: MapObject) {
    const PAD = 6, GAP = 4
    const width = Math.min(70, Math.max(20, parent.width - PAD * 2))
    const height = Math.min(36, Math.max(20, parent.height - PAD * 2))
    const siblings = objectsRef.current.filter(o => o.object_type === 'room' && o.parent_id === parent.map_object_id && (!newFloor || !o.floor || o.floor === newFloor))
    const maxX = parent.x + parent.width - width, maxY = parent.y + parent.height - height
    for (let y = parent.y + PAD; y <= maxY; y += 6) {
      for (let x = parent.x + PAD; x <= maxX; x += 6) {
        const clear = siblings.every(o => x + width + GAP <= o.x || o.x + o.width + GAP <= x || y + height + GAP <= o.y || o.y + o.height + GAP <= y)
        if (clear) return { x, y, width, height }
      }
    }
    // building is full: still inside it, just stacked on top-left
    return { x: clamp(parent.x + PAD, parent.x, Math.max(parent.x, maxX)), y: clamp(parent.y + PAD, parent.y, Math.max(parent.y, maxY)), width, height }
  }
  async function addObject() {
    try {
      const isRoom = newType === 'room'
      const parentObject = isRoom ? buildings.find(b => b.map_object_id === targetBuildingId) : null
      if (isRoom && !parentObject) { setMessage('Add a building first, then add rooms to it.'); return }
      const box = parentObject
        ? roomSpawnBox(parentObject)
        : { x: 80, y: 80, width: newType === 'wall' ? 220 : 140, height: newType === 'wall' ? 20 : 80 }
      const data: any = await request('POST', { object_type: newType, name: newName.trim() || LABELS[newType], color: COLORS[0], ...box, parent_id: parentObject?.map_object_id ?? null, floor: isRoom ? newFloor : null })
      const item = normaliseObject(data.data)
      replaceObjects(current => [...current, item]); setSelectedId(item.map_object_id); setNewName('')
      setMessage(isRoom ? `Room added inside ${parentObject!.name}. Drag it into place.` : 'Map item added. Drag it into place.'); void onChanged()
    } catch (error: any) { setMessage(error.message) }
  }
  function updateSelected(change: Partial<MapObject>) {
    if (!selected) return
    replaceObjects(current => current.map(item => item.map_object_id === selected.map_object_id ? { ...item, ...change } : item))
  }
  async function saveSelected() {
    const current = objectsRef.current.find(item => item.map_object_id === selectedId)
    if (!current) return
    try {
      await enqueue(() => request('PUT', current))
      await onChanged()
      setMessage('Saved.')
    } catch (error: any) {
      setMessage(error.message)
    }
  }
  async function removeSelected() {
    if (!selected || !confirm(`Delete ${selected.name}?`)) return
    try { await request('DELETE', { map_object_id: selected.map_object_id }); replaceObjects(current => current.filter(item => item.map_object_id !== selected.map_object_id)); setSelectedId(null); setMessage('Deleted.'); void onChanged() } catch (error: any) { setMessage(error.message) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
      <MapCanvas objects={objects} devices={devices} incidents={incidents} equipment={equipment} equipmentOffsets={extOffsets} onEquipmentPointerDown={beginExt} selectedId={selectedId} canvasRef={canvasRef} onPointerDown={begin} onPointerMove={move} onPointerUp={end} isEditor highlightId={targetBuildingId} />
      <aside style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
        <h3 style={{ margin: '0 0 6px' }}>Map Editor</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '.75rem' }}>Drag an item to move it. Selected items can be resized from the blue corner. Drag each 🧯 extinguisher to its exact spot (dashed outline = not placed yet).</p>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 10 }}>
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)' }}>New item type</label>
          <select value={newType} onChange={e => setNewType(e.target.value as MapObject['object_type'])} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
            {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {newType === 'room' && <>
            <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Building</label>
            <select value={targetBuildingId ?? ''} onChange={e => setNewParent(e.target.value ? Number(e.target.value) : '')} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
              {buildings.map(b => <option key={b.map_object_id} value={b.map_object_id}>{b.name}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Floor</label>
            <input value={newFloor} onChange={e => setNewFloor(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
          </>}
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={LABELS[newType]} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
          <button onClick={addObject} style={{ width: '100%', marginTop: 10, padding: 10 }}>+ Add to map</button>
        </div>

        {selected && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
            <b style={{ fontSize: '.85rem' }}>Selected: {selected.name}</b>
            <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Name</label>
            <input value={selected.name} onChange={e => updateSelected({ name: e.target.value })} onBlur={saveSelected} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
            <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Colour</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {COLORS.map(color => <button key={color} aria-label={color} onClick={() => { updateSelected({ color }); setTimeout(saveSelected, 0) }} style={{ width: 22, height: 22, padding: 0, background: color, border: selected.color === color ? '2px solid white' : '1px solid transparent', borderRadius: 3 }} />)}
            </div>
            <button onClick={removeSelected} style={{ width: '100%', marginTop: 12, padding: 9, color: 'var(--red)' }}>Delete selected</button>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 10 }}>
          <b style={{ fontSize: '.85rem' }}>Map contents</b>
          <p style={{ margin: '6px 0 10px', color: 'var(--muted)', fontSize: '.72rem' }}>
            Saved blocks on this map. Select one to rename, recolour, resize, or delete it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
            {objects.map(object => (
              <button
                key={object.map_object_id}
                onClick={() => setSelectedId(object.map_object_id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                  border: object.map_object_id === selectedId ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: object.map_object_id === selectedId ? 'rgba(0,194,255,.10)' : 'var(--panel2)',
                  color: 'var(--text)', cursor: 'pointer', fontSize: '.76rem',
                }}
              >
                <span style={{ color: object.color, marginRight: 7 }}>●</span>
                {LABELS[object.object_type]} — {object.name}
              </button>
            ))}
          </div>
        </div>

        {message && <div style={{ color: /Saved|added/.test(message) ? 'var(--accent)' : 'var(--red)', fontSize: '.75rem', marginTop: 12 }}>{message}</div>}
      </aside>
    </div>
  )
}