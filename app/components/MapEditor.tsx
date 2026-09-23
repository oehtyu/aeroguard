'use client'

import { PointerEvent, RefObject, useEffect, useRef, useState } from 'react'

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

function normaliseObject(object: MapObject): MapObject {
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

// Finds the closest "safe_zone" (Assembly Area) block to a given building,
// by straight-line distance between their centers. This replaces the old
// hand-authored per-building gate assignment — as the admin reshapes the
// map or adds new assembly areas, routing adjusts automatically.
export function findNearestSafeZone(building: MapObject | undefined | null, allObjects: MapObject[]): MapObject | null {
  if (!building) return null
  const safeZones = allObjects.filter(o => o.object_type === 'safe_zone')
  if (safeZones.length === 0) return null
  const b = centerOf(building)
  let best: MapObject | null = null
  let bestDist = Infinity
  for (const zone of safeZones) {
    // Deliberately the zone's own rectangle center here, NOT its draggable
    // pin — which zone is "nearest" should reflect real campus geometry,
    // not wherever an admin happened to drag that zone's flag for display.
    const z = centerOf(zone)
    const dist = Math.hypot(z.cx - b.cx, z.cy - b.cy)
    if (dist < bestDist) { bestDist = dist; best = zone }
  }
  return best
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
  // true only inside the admin Map Editor. Controls two things: Assembly
  // Area blocks render faint/see-through (so the admin can see what's
  // underneath while positioning a large zone) instead of the compact pin
  // shown to everyone else, and pointer handlers are wired up at all.
  isEditor?: boolean
}

export function MapCanvas({ objects, devices = [], incidents = [], equipment = [], selectedId, canvasRef, onPointerDown, onPointerMove, onPointerUp, isEditor = false }: CanvasProps) {
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
    const safeZone = findNearestSafeZone(building, display)
    if (!building || !safeZone) return []
    const points = bentRoute(centerOf(building), pinOf(safeZone), building.map_object_id)
    return [{ device_id: device.device_id, threat_level: incident.threat_level, points, safeZoneName: safeZone.name }]
  })

  return (
    // Outer wrapper is the actual scrollable/pannable viewport — this is
    // what fixes mobile: instead of shrinking the whole map to fit a
    // narrow screen (making text illegible), the map stays at a fixed,
    // always-readable size and the wrapper scrolls/pans to reach the rest.
    <div style={{ width: '100%', maxHeight: '70vh', overflow: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)', borderRadius: 10, background: '#0d1421' }}>
           <div ref={canvasRef} data-map-canvas onPointerMove={isEditor ? onPointerMove : undefined} onPointerUp={isEditor ? onPointerUp : undefined} onPointerCancel={isEditor ? onPointerUp : undefined}
        style={{ width: CANVAS_W, height: CANVAS_H, position: 'relative', background: '#0d1421', touchAction: isEditor ? 'none' : 'auto', userSelect: 'none' }}>
        {ordered.map(object => {
          const isRoom = object.object_type === 'room'
          const isSafeZone = object.object_type === 'safe_zone'
          const selected = object.map_object_id === selectedId
          return (
            <div key={object.map_object_id} onPointerDown={event => isEditor && onPointerDown?.(event, object)}
              style={{ position: 'absolute', left: object.x, top: object.y, width: object.width, height: object.height,
                boxSizing: 'border-box',
                background: object.object_type === 'wall' ? object.color : isRoom ? '#334155' : isSafeZone ? `${object.color}26` : `${object.color}99`,
                border: `${selected ? 2 : 1}px solid ${selected ? '#00c2ff' : object.color}`,
                borderStyle: isSafeZone ? 'dashed' : 'solid',
                borderRadius: object.object_type === 'wall' ? 1 : 4, zIndex: isRoom ? 3 : isSafeZone ? 0 : 1,
                cursor: isEditor && onPointerDown ? 'grab' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: isRoom ? 11 : 13, fontWeight: 700, overflow: 'visible' }}>
              <span style={{ pointerEvents: 'none', textAlign: 'center', padding: 3 }}>{object.name}</span>
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
          const building = display.find(object =>
            object.object_type === 'building' && object.name === item.building
          )
          if (!building) return null

          // Locations chosen in the dashboard read "Near <room name>". If that
          // room exists on the map, pin the extinguisher to the room's corner
          // so it shows up exactly where it was assigned.
          const wanted = /^near\s+(.+)$/i.exec(String(item.location_description || '').trim())?.[1]?.trim().toLowerCase()
          const room = wanted
            ? display.find(o => o.object_type === 'room' && o.parent_name === item.building &&
                o.name.trim().toLowerCase() === wanted && (!item.floor || !o.floor || o.floor === item.floor))
            : undefined

          let markerX: number
          let markerY: number
          if (room) {
            markerX = clamp(room.x + room.width - 12, room.x + 12, room.x + room.width)
            markerY = clamp(room.y + room.height - 12, room.y + 12, room.y + room.height)
          } else {
            // Hallway / stairs / older records: spread around the building's
            // upper-right corner so markers never overlap.
            const generic = equipment.filter(e => e.building === item.building)
            const positionInBuilding = generic.findIndex(e => String(e.equipment_id) === String(item.equipment_id))
            const column = positionInBuilding % 3
            const rowIdx = Math.floor(positionInBuilding / 3)
            markerX = clamp(building.x + building.width - 18 - column * 28, building.x + 12, building.x + building.width - 12)
            markerY = clamp(building.y + 18 + rowIdx * 28, building.y + 12, building.y + building.height - 12)
          }
          const statusColor = item.status === 'Expired' ? '#ef4444' : item.status === 'Maintenance' ? '#eab308' : '#f97316'

          return (
            <div
              key={`extinguisher-${item.equipment_id || index}`}
              title={`Extinguisher: ${item.equipment_type || 'ABC'} | ${item.building} | ${item.floor || ''} ${item.location_description || ''} | ${item.status || 'Active'}`}
              style={{
                position: 'absolute',
                left: markerX,
                top: markerY,
                transform: 'translate(-50%, -50%)',
                width: 23,
                height: 23,
                borderRadius: 5,
                background: statusColor,
                border: '2px solid white',
                zIndex: 6,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                // hoverable on the live map; click-through in the editor so dragging still works
                pointerEvents: isEditor ? 'none' : 'auto',
                boxShadow: `0 0 0 3px ${statusColor}33`,
              }}
            >
              🧯
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


export default function MapEditor({ initialObjects, adminId, onChanged, devices = [], incidents = [], equipment = [] }: { initialObjects: MapObject[]; adminId: number; onChanged: () => Promise<void> | void; devices?: any[]; incidents?: any[]; equipment?: any[] }) {
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

  const replaceObjects = (updater: MapObject[] | ((current: MapObject[]) => MapObject[])) => {
    setObjects(current => {
      const next = typeof updater === 'function' ? updater(current) : updater
      objectsRef.current = next
      return next
    })
  }
  const selected = objects.find(object => object.map_object_id === selectedId) || null
  const buildings = objects.filter(object => object.object_type === 'building')

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
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = interaction.current
    const canvas = canvasRef.current
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

  async function addObject() {
    try {
      const parent = newType === 'room' ? (newParent || buildings[0]?.map_object_id) : null
      const data: any = await request('POST', { object_type: newType, name: newName.trim() || LABELS[newType], color: COLORS[0], x: 80, y: 80, width: newType === 'wall' ? 220 : 140, height: newType === 'wall' ? 20 : 80, parent_id: parent, floor: newType === 'room' ? newFloor : null })
      const item = normaliseObject(data.data)
      replaceObjects(current => [...current, item]); setSelectedId(item.map_object_id); setNewName('')
      setMessage('Map item added. Drag it into place.'); void onChanged()
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
      <MapCanvas objects={objects} devices={devices} incidents={incidents} equipment={equipment} selectedId={selectedId} canvasRef={canvasRef} onPointerDown={begin} onPointerMove={move} onPointerUp={end} isEditor />
      <aside style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
        <h3 style={{ margin: '0 0 6px' }}>Map Editor</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '.75rem' }}>Drag an item to move it. Selected items can be resized from the blue corner.</p>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 10 }}>
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)' }}>New item type</label>
          <select value={newType} onChange={e => setNewType(e.target.value as MapObject['object_type'])} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
            {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {newType === 'room' && <>
            <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Building</label>
            <select value={newParent} onChange={e => setNewParent(e.target.value ? Number(e.target.value) : '')} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
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

        {message && <div style={{ color: message.includes('Saved') ? 'var(--accent)' : 'var(--red)', fontSize: '.75rem', marginTop: 12 }}>{message}</div>}
      </aside>
    </div>
  )
}