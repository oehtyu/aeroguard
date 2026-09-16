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

type CanvasProps = {
  objects: MapObject[]
  devices?: any[]
  incidents?: any[]
  selectedId?: number | null
  canvasRef?: RefObject<HTMLDivElement>
  onPointerDown?: (event: PointerEvent<HTMLDivElement>, object: MapObject, resize?: boolean) => void
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void
}

export function MapCanvas({ objects, devices = [], incidents = [], selectedId, canvasRef, onPointerDown, onPointerMove, onPointerUp }: CanvasProps) {
  const display = objects.map(normaliseObject)
  const activeByDevice = new Map(incidents.filter(incident => !incident.resolved).map(incident => [incident.device_id, incident]))
  const ordered = [...display].sort((a, b) => (a.object_type === 'room' ? 1 : 0) - (b.object_type === 'room' ? 1 : 0))

  return (
    <div ref={canvasRef} data-map-canvas onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ width: '100%', aspectRatio: `${CANVAS_W}/${CANVAS_H}`, position: 'relative', overflow: 'hidden', background: '#0d1421', border: '1px solid var(--border)', borderRadius: 10, touchAction: 'none', userSelect: 'none' }}>
      {ordered.map(object => {
        const isRoom = object.object_type === 'room'
        const selected = object.map_object_id === selectedId
        return (
          <div key={object.map_object_id} onPointerDown={event => onPointerDown?.(event, object)}
            style={{ position: 'absolute', left: `${object.x / CANVAS_W * 100}%`, top: `${object.y / CANVAS_H * 100}%`, width: `${object.width / CANVAS_W * 100}%`, height: `${object.height / CANVAS_H * 100}%`,
              boxSizing: 'border-box', background: object.object_type === 'wall' ? object.color : isRoom ? '#334155' : `${object.color}99`, border: `${selected ? 2 : 1}px solid ${selected ? '#00c2ff' : object.color}`,
              borderRadius: object.object_type === 'wall' ? 1 : 4, zIndex: isRoom ? 3 : 1, cursor: onPointerDown ? 'grab' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: isRoom ? 11 : 13, fontWeight: 700, overflow: 'visible' }}>
            <span style={{ pointerEvents: 'none', textAlign: 'center', padding: 3 }}>{object.name}</span>
            {selected && onPointerDown && <div onPointerDown={event => { event.stopPropagation(); onPointerDown(event, object, true) }}
              style={{ position: 'absolute', width: 11, height: 11, right: -6, bottom: -6, background: '#00c2ff', border: '2px solid #fff', borderRadius: 2, cursor: 'nwse-resize' }} />}
          </div>
        )
      })}
      {devices.map(device => {
        const room = display.find(object => object.object_type === 'room' && object.parent_name === device.building && object.name === device.room && (!device.floor || !object.floor || object.floor === device.floor))
        if (!room) return null
        const incident = activeByDevice.get(device.device_id) as any
        const color = incident?.threat_level === 'Red' ? '#ef4444' : incident?.threat_level === 'Orange' ? '#f97316' : '#00c2ff'
        return <div key={device.device_id} title={`${device.device_id} — ${device.device_name || 'Smoke detector'}`} style={{ position: 'absolute', left: `${(room.x + room.width / 2) / CANVAS_W * 100}%`, top: `${(room.y + room.height / 2) / CANVAS_H * 100}%`, transform: 'translate(-50%, -50%)', width: 24, height: 24, borderRadius: '50%', background: color, border: '2px solid white', zIndex: 5, display: 'grid', placeItems: 'center', fontSize: 12, pointerEvents: 'none', boxShadow: `0 0 0 3px ${color}33` }}>📡</div>
      })}
    </div>
  )
}

type Interaction = { id: number; resize: boolean; startX: number; startY: number; item: MapObject; children: MapObject[]; pointerId: number }

export default function MapEditor({ initialObjects, adminId, onChanged, devices = [], incidents = [] }: { initialObjects: MapObject[]; adminId: number; onChanged: () => Promise<void> | void; devices?: any[]; incidents?: any[] }) {
  // Important: this is deliberately a local editor copy. It must NOT be reset
  // by Dashboard's live refresh while the user is dragging.
  const [objects, setObjects] = useState<MapObject[]>(() => initialObjects.map(normaliseObject))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newType, setNewType] = useState<MapObject['object_type']>('building')
  const [newName, setNewName] = useState('')
  const [newFloor, setNewFloor] = useState('1F')
  const [newParent, setNewParent] = useState<number | ''>('')
  const [message, setMessage] = useState('')
  const [presets, setPresets] = useState<{ preset_id: number; name: string; created_at: string }[]>([])
  const [selectedPreset, setSelectedPreset] = useState<number | ''>('')
  const [newPresetName, setNewPresetName] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  const objectsRef = useRef<MapObject[]>(initialObjects.map(normaliseObject))
  const interaction = useRef<Interaction | null>(null)
  const hasHydrated = useRef(initialObjects.length > 0)
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
  async function reloadEditorObjects() {
    const response = await fetch('/api/map', { cache: 'no-store' })
    const data = await response.json()
    if (!data.success) throw new Error(data.message || 'Could not reload the map.')
    replaceObjects((data.data as MapObject[]).map(normaliseObject))
  }
  async function loadPresets() {
    try {
      const response = await fetch('/api/map/presets', { cache: 'no-store' })
      const data = await response.json()
      if (!data.success) throw new Error(data.message || 'Could not load presets.')
      setPresets(data.data)
    } catch (error: any) { setMessage(error.message) }
  }
  useEffect(() => { void loadPresets() }, [])

  // Only accept the initial asynchronous load once. Do not add a normal
  // [initialObjects] syncing effect: that is the source of drag jitter.
  useEffect(() => {
    if (hasHydrated.current || initialObjects.length === 0) return
    const loaded = initialObjects.map(normaliseObject)
    hasHydrated.current = true
    replaceObjects(loaded)
  }, [initialObjects])

  async function savePreset() {
    if (!newPresetName.trim()) { setMessage('Enter a name for the preset first.'); return }
    try {
      const data: any = await enqueue(async () => {
        const response = await fetch('/api/map/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, name: newPresetName.trim() }) })
        const result = await response.json()
        if (!result.success) throw new Error(result.message || 'Could not save preset.')
        return result
      })
      setPresets(current => [data.data, ...current])
      setSelectedPreset(Number(data.data.preset_id)); setNewPresetName('')
      setMessage(`Preset "${data.data.name}" saved.`)
    } catch (error: any) { setMessage(error.message) }
  }
  async function loadPreset() {
    if (!selectedPreset || !confirm('This replaces the current map layout with this preset. Continue?')) return
    try {
      await enqueue(async () => {
        const response = await fetch('/api/map/presets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, preset_id: selectedPreset }) })
        const data = await response.json()
        if (!data.success) throw new Error(data.message || 'Could not load preset.')
        await reloadEditorObjects()
      })
      setSelectedId(null); setMessage('Preset loaded.'); void onChanged()
    } catch (error: any) { setMessage(error.message) }
  }
  async function deletePreset() {
    if (!selectedPreset || !confirm('Delete this saved preset? This cannot be undone.')) return
    try {
      const response = await fetch('/api/map/presets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, preset_id: selectedPreset }) })
      const data = await response.json()
      if (!data.success) throw new Error(data.message || 'Could not delete preset.')
      setSelectedPreset(''); await loadPresets(); setMessage('Preset deleted.')
    } catch (error: any) { setMessage(error.message) }
  }

  function begin(event: PointerEvent<HTMLDivElement>, object: MapObject, resize = false) {
    event.preventDefault(); event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.setPointerCapture(event.pointerId)
    interaction.current = { id: object.map_object_id, resize, startX: (event.clientX - rect.left) * CANVAS_W / rect.width, startY: (event.clientY - rect.top) * CANVAS_H / rect.height, item: normaliseObject(object), pointerId: event.pointerId, children: object.object_type === 'building' ? objectsRef.current.filter(item => item.parent_id === object.map_object_id).map(normaliseObject) : [] }
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
    try { await request('PUT', current); setMessage('Saved.'); void onChanged() } catch (error: any) { setMessage(error.message) }
  }
  async function removeSelected() {
    if (!selected || !confirm(`Delete ${selected.name}?`)) return
    try { await request('DELETE', { map_object_id: selected.map_object_id }); replaceObjects(current => current.filter(item => item.map_object_id !== selected.map_object_id)); setSelectedId(null); setMessage('Deleted.'); void onChanged() } catch (error: any) { setMessage(error.message) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
      <MapCanvas objects={objects} devices={devices} incidents={incidents} selectedId={selectedId} canvasRef={canvasRef} onPointerDown={begin} onPointerMove={move} onPointerUp={end} />
      <aside style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
        <h3 style={{ margin: '0 0 6px' }}>Map Editor</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '.75rem' }}>Drag an item to move it. Selected items can be resized from the blue corner.</p>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 10 }}><b style={{ fontSize: '.85rem' }}>Presets</b>
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 10 }}>Saved presets</label>
          <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value ? Number(e.target.value) : '')} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}><option value="">Select a preset...</option>{presets.map(p => <option key={p.preset_id} value={p.preset_id}>{p.name}</option>)}</select>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button onClick={loadPreset} disabled={!selectedPreset} style={{ flex: 1, padding: 9 }}>Load selected</button><button onClick={deletePreset} disabled={!selectedPreset} style={{ color: 'var(--red)', padding: '9px 12px' }}>Delete</button></div>
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 12 }}>Save current map as...</label>
          <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)} placeholder="e.g. original-map" style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
          <button onClick={savePreset} style={{ width: '100%', marginTop: 8, padding: 10 }}>💾 Save as new preset</button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)' }}>New item type</label>
          <select value={newType} onChange={e => setNewType(e.target.value as MapObject['object_type'])} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {newType === 'room' && <><label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Building</label><select value={newParent} onChange={e => setNewParent(e.target.value ? Number(e.target.value) : '')} style={{ width: '100%', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>{buildings.map(b => <option key={b.map_object_id} value={b.map_object_id}>{b.name}</option>)}</select><label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Floor</label><input value={newFloor} onChange={e => setNewFloor(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} /></>}
          <label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Name</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder={LABELS[newType]} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
          <button onClick={addObject} style={{ width: '100%', marginTop: 10, padding: 10 }}>+ Add to map</button>
        </div>
        {selected && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}><b style={{ fontSize: '.85rem' }}>Selected: {selected.name}</b><label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Name</label><input value={selected.name} onChange={e => updateSelected({ name: e.target.value })} onBlur={saveSelected} style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} /><label style={{ display: 'block', fontSize: '.7rem', color: 'var(--muted)', marginTop: 8 }}>Colour</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{COLORS.map(color => <button key={color} aria-label={color} onClick={() => { updateSelected({ color }); setTimeout(saveSelected, 0) }} style={{ width: 22, height: 22, padding: 0, background: color, border: selected.color === color ? '2px solid white' : '1px solid transparent', borderRadius: 3 }} />)}</div><button onClick={removeSelected} style={{ width: '100%', marginTop: 12, padding: 9, color: 'var(--red)' }}>Delete selected</button></div>}
        {message && <div style={{ color: message.includes('Saved') || message.includes('loaded') ? 'var(--accent)' : 'var(--red)', fontSize: '.75rem', marginTop: 12 }}>{message}</div>}
      </aside>
    </div>
  )
}
