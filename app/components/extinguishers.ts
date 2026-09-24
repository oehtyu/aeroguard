import type { MapObject } from './MapEditor'

// ─────────────────────────────────────────────────────────────
// Everything about WHERE extinguishers are and WHICH ones to send people to.
// Shared by the map (markers / numbered badges) and the alert guidance card,
// so both always agree.
// ─────────────────────────────────────────────────────────────

// "COAS Building" (equipment record) and "COAS" (map block) are the same place.
const normName = (v: unknown) => String(v ?? '').toLowerCase().replace(/\bbuilding\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
export const sameBuilding = (a: unknown, b: unknown) => normName(a) === normName(b) && normName(a) !== ''

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const squash = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '')

export type EquipPoint = { x: number; y: number; placed: boolean; building: MapObject }

// Where an extinguisher is drawn on the map:
//  1) a position an admin dragged it to (stored relative to its building),
//  2) the room named in its location ("Near Room 101"),
//  3) a tidy spot along the building's edge.
export function resolveEquipmentPoint(
  item: any, objects: MapObject[], equipment: any[], offsets: Record<string, { x: number; y: number }> = {},
): EquipPoint | null {
  const building = objects.find(o => o.object_type === 'building' && sameBuilding(o.name, item.building))
  if (!building) return null

  const dragged = offsets[String(item.equipment_id)]
  const saved = item.map_x != null && item.map_y != null && Number.isFinite(Number(item.map_x)) && Number.isFinite(Number(item.map_y))
    ? { x: Number(item.map_x), y: Number(item.map_y) } : null
  const offset = dragged || saved
  if (offset) return { x: building.x + offset.x, y: building.y + offset.y, placed: true, building }

  const desc = String(item.location_description || '').trim()
  const wanted = squash(/^near\s+(.+)$/i.exec(desc)?.[1] ?? /\broom\s*(\d+)/i.exec(desc)?.[0] ?? '')
  const room = wanted
    ? objects.find(o => o.object_type === 'room' && o.parent_id === building.map_object_id &&
        squash(o.name) === wanted && (!item.floor || !o.floor || o.floor === item.floor))
    : undefined
  if (room) {
    return {
      x: clamp(room.x + room.width - 12, room.x + 12, room.x + room.width),
      y: clamp(room.y + room.height - 12, room.y + 12, room.y + room.height),
      placed: false, building,
    }
  }

  const generic = equipment.filter(e => sameBuilding(e.building, item.building))
  const i = Math.max(0, generic.findIndex(e => String(e.equipment_id) === String(item.equipment_id)))
  return {
    x: clamp(building.x + building.width - 18 - (i % 3) * 28, building.x + 12, building.x + building.width - 12),
    y: clamp(building.y + 18 + Math.floor(i / 3) * 28, building.y + 12, building.y + building.height - 12),
    placed: false, building,
  }
}

const floorNumber = (f: unknown) => { const m = /(-?\d+)/.exec(String(f ?? '')); return m ? Number(m[1]) : 1 }
// Only "Active" units are ever recommended. Maintenance / Expired (or anything unrecognised) are ignored.
const isAvailable = (e: any) => String(e.status || 'Active').trim().toLowerCase() === 'active'

export type NearExt = {
  item: any
  rank: number                 // 1 = nearest
  inSameBuilding: boolean
  point: { x: number; y: number } | null
}
export type NearestResult = {
  usable: NearExt[]            // up to `limit` AVAILABLE extinguishers, nearest first (may include other buildings)
  sameBuildingCount: number    // how many of them are inside the alerting building
}

const FLOOR_PENALTY = 60       // one floor up/down counts like this many px of walking (used for ordering only)
const UNKNOWN_DISTANCE = 99999 // no map position and not in the alerting building: ranked last, never dropped

// The nearest AVAILABLE extinguishers to the room that is alerting — `limit` (3) of them if that
// many exist anywhere on campus. If the alerting building has fewer than 3 working ones, the
// nearest in other buildings fill the remaining spots. Maintenance / Expired units are never
// returned, so when none are left the result is simply empty.
export function nearestExtinguishers(opts: {
  buildingName: string; floor?: string; room?: MapObject | null
  objects: MapObject[]; equipment: any[]; limit?: number
}): NearestResult {
  const { buildingName, floor, room, objects, equipment, limit = 3 } = opts
  const building = objects.find(o => o.object_type === 'building' && sameBuilding(o.name, buildingName))
  const origin = room ? { x: room.x + room.width / 2, y: room.y + room.height / 2 }
                      : building ? { x: building.x + building.width / 2, y: building.y + building.height / 2 } : null

  const scored = equipment.filter(isAvailable).map(item => {
    const inSame = sameBuilding(item.building, buildingName)
    const p = resolveEquipmentPoint(item, objects, equipment)
    const point = p ? { x: p.x, y: p.y } : null
    const dist = origin && point ? Math.hypot(point.x - origin.x, point.y - origin.y) : inSame ? 0 : UNKNOWN_DISTANCE
    const floorDiff = floor ? floorNumber(item.floor) - floorNumber(floor) : 0
    return { item, inSame, point, score: dist + FLOOR_PENALTY * Math.abs(floorDiff) }
  })
  scored.sort((a, b) => a.score - b.score)

  const usable = scored.slice(0, limit)
    .map((s, i): NearExt => ({ item: s.item, rank: i + 1, inSameBuilding: s.inSame, point: s.point }))
  return { usable, sameBuildingCount: usable.filter(n => n.inSameBuilding).length }
}
