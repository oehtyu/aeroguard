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
  parent_id?: number | null
  parent_name?: string | null
  floor?: string | null
}

const CANVAS_W = 1140
const CANVAS_H = 600
const COLORS = ['#1e3a5f', '#2d1e5f', '#3a1a2f', '#14532d', '#166534', '#475569', '#f97316', '#ef4444']
const LABELS: Record<MapObject['object_type'], string> = {
  building: 'Building', room: 'Room', tree_area: 'Tree / Green Area', wall: 'Wall',
  gate: 'Gate', safe_zone: 'Safe / Assembly Zone', area: 'Area',
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
function numberValue(value: unknown, fallback: number) { const n = Number(value); return Number.isFinite(n) ? n : fallback }

type CanvasProps = { objects: MapObject[]; devices?: any[]; incidents?: any[]; selectedId?: number | null; canvasRef?: RefObject<HTMLDivElement>; onPointerDown?: (event: PointerEvent<HTMLDivElement>, object: MapObject, resize?: boolean) => void; onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void }

export function MapCanvas({ objects, devices = [], incidents = [], selectedId, canvasRef, onPointerDown, onPointerMove, onPointerUp }: CanvasProps) {
  const activeByDevice = new Map(incidents.filter(i => !i.resolved).map(i => [i.device_id, i]))
  const rooms = objects.filter(o => o.object_type === 'room')
  return (
    <div ref={canvasRef} data-map-canvas onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ width: '100%', aspectRatio: `${CANVAS_W}/${CANVAS_H}`, position: 'relative', overflow: 'hidden', background: '#0d1421', border: '1px solid var(--border)', borderRadius: 10, touchAction: 'none' }}>
      {objects.map(object => (
        <div key={object.map_object_id}
          onPointerDown={event => onPointerDown?.(event, object)}
          style={{ position: 'absolute', left: `${object.x / CANVAS_W * 100}%`, top: `${object.y / CANVAS_H * 100}%`, width: `${object.width / CANVAS_W * 100}%`, height: `${object.height / CANVAS_H * 100}%`, background: object.object_type === 'wall' ? object.color : `${object.color}99`, border: `1px solid ${object.color}`, borderRadius: object.object_type === 'wall' ? 1 : 4, zIndex: object.object_type === 'room' ? 3 : 1, cursor: onPointerDown ? 'move' : 'default', userSelect: 'none', boxSizing: 'border-box' }}>
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 3, textAlign: 'center', color: '#fff', fontSize: object.object_type === 'room' ? 10 : 12, fontWeight: 700, overflow: 'hidden' }}>{object.object_type === 'gate' ? '🚪 ' : object.object_type === 'safe_zone' ? '✓ ' : ''}{object.name}</span>
          {selectedId === object.map_object_id && onPointerDown && <div onPointerDown={event => onPointerDown(event, object, true)} style={{ position: 'absolute', width: 12, height: 12, right: -6, bottom: -6, borderRadius: 2, background: '#00c2ff', border: '2px solid white', cursor: 'nwse-resize', zIndex: 10 }} />}
        </div>
      ))}
      {devices.map(device => {
        const room = rooms.find(r => r.name === device.room && r.floor === device.floor && r.parent_name === device.building)
        if (!room) return null
        const incident: any = activeByDevice.get(device.device_id)
        const color = incident?.threat_level === 'Red' ? '#ef4444' : incident?.threat_level === 'Orange' ? '#f97316' : '#00c2ff'
        return <div key={device.device_id} title={`${device.device_id} — ${device.room}`} style={{ position: 'absolute', left: `${(room.x + room.width / 2) / CANVAS_W * 100}%`, top: `${(room.y + room.height / 2) / CANVAS_H * 100}%`, transform: 'translate(-50%, -50%)', width: 24, height: 24, borderRadius: '50%', background: color, border: '2px solid white', zIndex: 8, display: 'grid', placeItems: 'center', fontSize: 12 }}>📡</div>
      })}
    </div>
  )
}

export default function MapEditor({ initialObjects, adminId, onChanged, devices = [], incidents = [] }: { initialObjects: MapObject[]; adminId: number; onChanged: () => Promise<void> | void; devices?: any[]; incidents?: any[] }) {
  const [objects, setObjects] = useState(initialObjects)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newType, setNewType] = useState<MapObject['object_type']>('building')
  const [newName, setNewName] = useState('')
  const [newFloor, setNewFloor] = useState('1F')
  const [newParent, setNewParent] = useState<number | ''>('')
    const [message, setMessage] = useState('')
  const [presets, setPresets] = useState<{ preset_id: number; name: string; created_at: string }[]>([])
  const [selectedPreset, setSelectedPreset] = useState<number | ''>('')
  const [newPresetName, setNewPresetName] = useState('')
  const objectsRef = useRef(initialObjects)

  async function loadPresets() {
    const res = await fetch('/api/map/presets')
    const data = await res.json()
    if (data.success) setPresets(data.data)
  }
  useEffect(() => { loadPresets() }, [])

  async function savePreset() {
    if (!newPresetName.trim()) { setMessage('Enter a name for the preset first.'); return }
    try {
      await request('POST', { name: newPresetName.trim() })
      setNewPresetName(''); setMessage('Preset saved.'); await loadPresets()
    } catch (error: any) { setMessage(error.message) }
  }
  async function loadPreset() {
    if (!selectedPreset) return
    if (!confirm('This replaces the ENTIRE current map layout with this preset. Continue?')) return
    try {
      const response = await fetch('/api/map/presets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, preset_id: selectedPreset }) })
      const data = await response.json()
      if (!data.success) throw new Error(data.message)
      setMessage('Preset loaded.'); await onChanged()
    } catch (error: any) { setMessage(error.message) }
  }
  async function deletePreset() {
    if (!selectedPreset || !confirm('Delete this saved preset? This cannot be undone.')) return
    try {
      const response = await fetch('/api/map/presets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, preset_id: selectedPreset }) })
      const data = await response.json()
      if (!data.success) throw new Error(data.message)
      setSelectedPreset(''); setMessage('Preset deleted.'); await loadPresets()
    } catch (error: any) { setMessage(error.message) }
  }
  const canvasRef = useRef<HTMLDivElement>(null)
  const interaction = useRef<{ id: number; resize: boolean; startX: number; startY: number; item: MapObject; children: MapObject[]; pointerId: number; captureEl: HTMLElement } | null>(null)

  useEffect(() => { setObjects(initialObjects); objectsRef.current = initialObjects }, [initialObjects])
  const selected = objects.find(o => o.map_object_id === selectedId) || null
  const buildings = objects.filter(o => o.object_type === 'building')

  async function request(method: 'POST' | 'PUT' | 'DELETE', body: any) {
    const response = await fetch('/api/map', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId, ...body }) })
    const data = await response.json()
    if (!data.success) throw new Error(data.message || 'Map change failed.')
    return data
  }

  async function save(item: MapObject, refresh = true) {
    try { await request('PUT', item); setMessage('Saved.'); if (refresh) await onChanged() }
    catch (error: any) { setMessage(error.message) }
  }

  function begin(event: PointerEvent<HTMLDivElement>, object: MapObject, resize = false) {
    event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = (event.clientX - rect.left) * CANVAS_W / rect.width
    const startY = (event.clientY - rect.top) * CANVAS_H / rect.height
    const captureEl = event.currentTarget as HTMLElement
    captureEl.setPointerCapture(event.pointerId)
    setSelectedId(object.map_object_id)
    interaction.current = {
      id: object.map_object_id, resize, startX, startY, item: object,
      pointerId: event.pointerId, captureEl,
      children: object.object_type === 'building'
        ? objectsRef.current.filter(item => item.parent_id === object.map_object_id)
        : [],
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = interaction.current; if (!active) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * CANVAS_W / rect.width
    const y = (event.clientY - rect.top) * CANVAS_H / rect.height
    const dx = x - active.startX; const dy = y - active.startY
    setObjects(current => {
      const next = current.map(item => {
        if (item.map_object_id === active.id) {
          return active.resize
            ? { ...item, width: clamp(active.item.width + dx, 20, CANVAS_W - item.x), height: clamp(active.item.height + dy, 20, CANVAS_H - item.y) }
            : { ...item, x: clamp(active.item.x + dx, 0, CANVAS_W - item.width), y: clamp(active.item.y + dy, 0, CANVAS_H - item.height) }
        }
        const child = active.children.find(saved => saved.map_object_id === item.map_object_id)
        return child
          ? { ...item, x: clamp(child.x + dx, 0, CANVAS_W - item.width), y: clamp(child.y + dy, 0, CANVAS_H - item.height) }
          : item
      })
      objectsRef.current = next
      return next
    })
  }

  async function end(event: PointerEvent<HTMLDivElement>) {
    const active = interaction.current
    if (!active) return
    interaction.current = null
    if (active.captureEl.hasPointerCapture(active.pointerId)) active.captureEl.releasePointerCapture(active.pointerId)
    const changedIds = [active.id, ...active.children.map(child => child.map_object_id)]
    const changed = objectsRef.current.filter(item => changedIds.includes(item.map_object_id))
    try {
      await Promise.all(changed.map(item => request('PUT', item)))
      setMessage('Saved.')
      await onChanged()
    } catch (error: any) { setMessage(error.message) }
  }

  async function addObject() {
    try {
      const parent = newType === 'room' ? (newParent || buildings[0]?.map_object_id) : null
      const data = await request('POST', { object_type: newType, name: newName || LABELS[newType], color: COLORS[0], x: 80, y: 80, width: newType === 'wall' ? 220 : 140, height: newType === 'wall' ? 20 : 80, parent_id: parent, floor: newType === 'room' ? newFloor : null })
      setNewName(''); setSelectedId(data.data.map_object_id); setMessage('Map item added. Drag it into place.'); await onChanged()
    } catch (error: any) { setMessage(error.message) }
  }

  async function removeSelected() {
    if (!selected || !confirm(`Delete ${selected.name}?`)) return
    try { await request('DELETE', { map_object_id: selected.map_object_id }); setSelectedId(null); setMessage('Deleted.'); await onChanged() }
    catch (error: any) { setMessage(error.message) }
  }

  function patchSelected(values: Partial<MapObject>) {
    if (!selected) return
    setObjects(current => {
      const next = current.map(o => o.map_object_id === selected.map_object_id ? { ...o, ...values } : o)
      objectsRef.current = next
      return next
    })
  }

  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
    <div><MapCanvas objects={objects} devices={devices} incidents={incidents} selectedId={selectedId} canvasRef={canvasRef} onPointerDown={begin} onPointerMove={move} onPointerUp={end} /></div>
    <aside style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong>Map Editor</strong><span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>Drag an item to move it. Select it, then drag the blue corner to resize it.</span>
      <hr />
      <strong style={{ fontSize: '.8rem' }}>Presets</strong>
      <label>Saved presets
        <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value ? Number(e.target.value) : '')}>
          <option value=''>Select a preset…</option>
          {presets.map(p => <option key={p.preset_id} value={p.preset_id}>{p.name}</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={loadPreset} disabled={!selectedPreset} style={{ flex: 1 }}>Load selected</button>
        <button onClick={deletePreset} disabled={!selectedPreset} style={{ color: 'var(--red)' }}>Delete</button>
      </div>
      <label>Save current map as…
        <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)} placeholder="e.g. original-backup" />
      </label>
      <button onClick={savePreset}>💾 Save as new preset</button>
      <hr />
      <label>New item type<select value={newType} onChange={e => setNewType(e.target.value as MapObject['object_type'])}>{Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Name<input value={newName} onChange={e => setNewName(e.target.value)} placeholder={LABELS[newType]} /></label>
      {newType === 'room' && <><label>Building<select value={newParent} onChange={e => setNewParent(Number(e.target.value))}>{buildings.map(b => <option key={b.map_object_id} value={b.map_object_id}>{b.name}</option>)}</select></label><label>Floor<input value={newFloor} onChange={e => setNewFloor(e.target.value)} /></label></>}
      <button onClick={addObject}>+ Add to map</button>
      {selected && <><hr /><strong>Selected: {selected.name}</strong><label>Name<input value={selected.name} onChange={e => patchSelected({ name: e.target.value })} onBlur={() => selected && save(objects.find(o => o.map_object_id === selected.map_object_id)!)} /></label>{selected.object_type === 'room' && <label>Floor<input value={selected.floor || ''} onChange={e => patchSelected({ floor: e.target.value })} onBlur={() => selected && save(objects.find(o => o.map_object_id === selected.map_object_id)!)} /></label>}<span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Colour</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{COLORS.map(color => <button aria-label={`Set colour ${color}`} key={color} onClick={() => { patchSelected({ color }); const changed = objects.find(o => o.map_object_id === selected.map_object_id); if (changed) save({ ...changed, color }) }} style={{ width: 24, height: 24, padding: 0, borderRadius: 4, background: color, border: selected.color === color ? '2px solid white' : '1px solid var(--border)' }} />)}</div><button onClick={removeSelected} style={{ color: 'var(--red)' }}>Delete selected</button></>}
      {message && <div style={{ fontSize: '.75rem', color: 'var(--accent)' }}>{message}</div>}
    </aside>
    <style jsx>{`label{display:flex;flex-direction:column;gap:4px;font-size:.75rem;color:var(--muted)}input,select,button{background:var(--panel2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px;font:inherit}button{cursor:pointer;font-weight:600}hr{width:100%;border:0;border-top:1px solid var(--border)}`}</style>
  </div>
}