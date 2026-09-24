import type { MapObject } from './MapEditor'

// ─────────────────────────────────────────────────────────────
// Evacuation route planner.
//
// The old route was a 2-segment "L" between two points, so it could cut
// straight through buildings. This plans a real path on a grid of the map:
//   • other buildings and walls are solid (with a small clearance)
//   • the origin building is open (you have to be able to leave it)
//   • gates are openings through walls
//   • green areas are walkable but discouraged, so paths prefer open ground
//   • every Assembly Area is tried and the one with the SHORTEST WALKABLE
//     route wins (not just the closest in a straight line)
// Result is straightened so it reads as a clean route, not a staircase.
//
// Performance: one Dijkstra sweep from the alert covers every assembly area at
// once, each grid cell is settled exactly once, and the obstacle grid is cached
// until the map's geometry changes. A flag that is unreachable (e.g. dropped on
// top of a building) is snapped to the nearest reachable spot instead of being
// searched for. Worst case is a few milliseconds of work, never a stall.
// ─────────────────────────────────────────────────────────────

const W = 1140
const H = 600
const CELL = 6        // grid resolution in map px
const PADS = [8, 4, 1]  // clearance kept around solid objects; relaxed only if no route exists
const TREE_COST = 2.2 // walking through a green area costs this much per cell

export type Pt = { cx: number; cy: number }
export type EvacPlan = { safeZone: MapObject; points: Pt[] }

const n = (v: unknown, fallback = 0) => { const x = Number(v); return Number.isFinite(x) ? x : fallback }
type Box = { x: number; y: number; w: number; h: number }
const box = (o: MapObject): Box => ({ x: n(o.x), y: n(o.y), w: n(o.width, 140), h: n(o.height, 80) })
const inside = (b: Box, x: number, y: number, pad = 0) =>
  x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad

export function pinPoint(o: MapObject): Pt {
  const b = box(o)
  return { cx: n(o.pin_x, b.x + b.w / 2), cy: n(o.pin_y, b.y + b.h / 2) }
}

// tiny binary min-heap keyed by distance
class Heap {
  private d: number[] = []
  private v: number[] = []
  get size() { return this.d.length }
  push(dist: number, item: number) {
    const d = this.d, v = this.v
    let k = d.length; d.push(dist); v.push(item)
    while (k > 0) {
      const p = (k - 1) >> 1
      if (d[p] <= d[k]) break
      ;[d[p], d[k]] = [d[k], d[p]]; [v[p], v[k]] = [v[k], v[p]]; k = p
    }
  }
  pop(): { dist: number; item: number } {
    const d = this.d, v = this.v
    const top = { dist: d[0], item: v[0] }
    const ld = d.pop()!, lv = v.pop()!
    if (d.length) {
      d[0] = ld; v[0] = lv
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k
        if (l < d.length && d[l] < d[m]) m = l
        if (r < d.length && d[r] < d[m]) m = r
        if (m === k) break
        ;[d[m], d[k]] = [d[k], d[m]]; [v[m], v[k]] = [v[k], v[m]]; k = m
      }
    }
    return top
  }
}

const cols = Math.ceil(W / CELL)
const rows = Math.ceil(H / CELL)
const cellIndex = (c: number, r: number) => r * cols + c
const cellOf = (x: number, y: number) => ({
  c: Math.min(cols - 1, Math.max(0, Math.floor(x / CELL))),
  r: Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))),
})

type Grid = { blocked: Uint8Array; cost: Float64Array; solidAt: (x: number, y: number) => boolean }

const geometry = (o: MapObject) => `${o.map_object_id}:${n(o.x)},${n(o.y)},${n(o.width)},${n(o.height)}`

// The obstacle grid depends only on geometry (not on flags or which room is alerting),
// so it is cached and reused while an admin drags flags around.
const gridCache = new Map<string, Grid>()
function gridFor(building: MapObject, all: MapObject[], pad: number): Grid {
  const solidsObj = all.filter(o => (o.object_type === 'building' && o.map_object_id !== building.map_object_id) || o.object_type === 'wall')
  const gatesObj = all.filter(o => o.object_type === 'gate')
  const treesObj = all.filter(o => o.object_type === 'tree_area')
  const key = `${pad}|${geometry(building)}|` + [...solidsObj, ...gatesObj, ...treesObj].map(geometry).join('|')
  const hit = gridCache.get(key)
  if (hit) return hit

  const origin = box(building)
  const solids = solidsObj.map(box), gates = gatesObj.map(box), trees = treesObj.map(box)

  // Solid = inside a padded building/wall, unless it's the origin building or a gate opening.
  const solidAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > W || y > H) return true
    if (inside(origin, x, y)) return false
    for (let i = 0; i < gates.length; i++) if (inside(gates[i], x, y, pad)) return false
    for (let i = 0; i < solids.length; i++) if (inside(solids[i], x, y, pad)) return true
    return false
  }

  const blocked = new Uint8Array(cols * rows)
  const cost = new Float64Array(cols * rows).fill(1)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL
    if (solidAt(x, y)) blocked[cellIndex(c, r)] = 1
    else for (let i = 0; i < trees.length; i++) if (inside(trees[i], x, y)) { cost[cellIndex(c, r)] = TREE_COST; break }
  }
  const grid = { blocked, cost, solidAt }
  gridCache.set(key, grid)
  if (gridCache.size > 12) gridCache.delete(gridCache.keys().next().value as string)
  return grid
}

// One sweep from the start over the whole walkable area. Every cell is settled once.
function sweep(grid: Grid, start: { c: number; r: number }) {
  const N = cols * rows
  const dist = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const done = new Uint8Array(N)
  const heap = new Heap()
  const s0 = cellIndex(start.c, start.r)
  dist[s0] = 0; heap.push(0, s0)
  while (heap.size) {
    const { dist: d, item: i } = heap.pop()
    if (done[i]) continue
    done[i] = 1
    const c = i % cols, r = (i - c) / cols
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue
      const nc = c + dc, nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const ni = cellIndex(nc, nr)
      if (done[ni] || grid.blocked[ni]) continue
      // never cut a corner diagonally past a solid
      if (dc && dr && (grid.blocked[cellIndex(c + dc, r)] || grid.blocked[cellIndex(c, r + dr)])) continue
      const cand = d + (dc && dr ? Math.SQRT2 : 1) * grid.cost[ni]
      if (cand < dist[ni]) { dist[ni] = cand; prev[ni] = i; heap.push(cand, ni) }
    }
  }
  return { dist, prev }
}

// Where should the route end for this assembly area? At the flag if it can be
// reached; otherwise (flag dropped on a building/wall) at the reachable spot
// inside the area — or just next to the flag — that is closest to it.
function goalFor(zone: MapObject, dist: Float64Array): { idx: number; pt: Pt } | null {
  const pin = pinPoint(zone)
  const pc = cellOf(pin.cx, pin.cy)
  const pi = cellIndex(pc.c, pc.r)
  if (dist[pi] < Infinity) return { idx: pi, pt: pin }

  const b = box(zone)
  const scan = (c0: number, c1: number, r0: number, r1: number) => {
    let best = -1, bestD = Infinity
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
      const i = cellIndex(c, r)
      if (dist[i] === Infinity) continue
      const d = Math.hypot((c + 0.5) * CELL - pin.cx, (r + 0.5) * CELL - pin.cy)
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  }
  let best = scan(Math.floor(b.x / CELL), Math.floor((b.x + b.w) / CELL), Math.floor(b.y / CELL), Math.floor((b.y + b.h) / CELL))
  if (best < 0) best = scan(pc.c - 6, pc.c + 6, pc.r - 6, pc.r + 6)
  if (best < 0) return null
  const c = best % cols, r = (best - c) / cols
  return { idx: best, pt: { cx: (c + 0.5) * CELL, cy: (r + 0.5) * CELL } }
}

// Which assembly area is this room ASSIGNED to?  An Assembly Area is a region (its rectangle)
// plus a flag. A room that sits inside a zone's rectangle belongs to that zone and is sent to
// its flag — even if another zone's flag happens to be a shorter walk. If it sits inside several
// (overlapping) zones, the smallest / most specific one wins. If it is inside none, the zone whose
// rectangle is nearest is used. Returned best-first, so callers can fall back to the next one
// only when the first cannot be reached at all.
export function assignSafeZones(building: MapObject, room: MapObject | null | undefined, all: MapObject[]): MapObject[] {
  const from: Pt = room ? { cx: n(room.x) + n(room.width, 60) / 2, cy: n(room.y) + n(room.height, 30) / 2 }
                        : { cx: n(building.x) + n(building.width, 140) / 2, cy: n(building.y) + n(building.height, 80) / 2 }
  return all.filter(o => o.object_type === 'safe_zone')
    .map(zone => {
      const b = box(zone)
      const inZone = inside(b, from.cx, from.cy)
      const dx = Math.max(b.x - from.cx, 0, from.cx - (b.x + b.w))
      const dy = Math.max(b.y - from.cy, 0, from.cy - (b.y + b.h))
      const rectDist = Math.hypot(dx, dy)
      const centerDist = Math.hypot(b.x + b.w / 2 - from.cx, b.y + b.h / 2 - from.cy)
      return { zone, inZone, area: b.w * b.h, rectDist, centerDist }
    })
    .sort((a, c) => (Number(c.inZone) - Number(a.inZone)) ||
      (a.inZone ? a.area - c.area : a.rectDist - c.rectDist) || (a.centerDist - c.centerDist))
    .map(x => x.zone)
}

const planCache = new Map<string, EvacPlan | null>()

export function planEvacuation(building: MapObject | undefined | null, room: MapObject | undefined | null, all: MapObject[]): EvacPlan | null {
  if (!building) return null
  const key = [building.map_object_id, room?.map_object_id ?? '', ...all.map(o =>
    `${o.map_object_id}:${o.object_type}:${n(o.x)},${n(o.y)},${n(o.width)},${n(o.height)},${o.pin_x ?? ''},${o.pin_y ?? ''}`)].join('|')
  if (planCache.has(key)) return planCache.get(key)!

  let plan: EvacPlan | null = null
  try {
    for (const pad of PADS) { plan = planWithPad(building, room, all, pad); if (plan) break }
  } catch (err) {
    console.error('[evacuation] route planning failed, using fallback', err)
    plan = null
  }
  planCache.set(key, plan)
  if (planCache.size > 12) planCache.delete(planCache.keys().next().value as string)
  return plan
}

function planWithPad(building: MapObject, room: MapObject | null | undefined, all: MapObject[], pad: number): EvacPlan | null {
  const zones = all.filter(o => o.object_type === 'safe_zone')
  if (zones.length === 0) return null

  const grid = gridFor(building, all, pad)
  const origin = box(building)
  const startPt: Pt = room ? { cx: n(room.x) + n(room.width, 60) / 2, cy: n(room.y) + n(room.height, 30) / 2 }
                            : { cx: origin.x + origin.w / 2, cy: origin.y + origin.h / 2 }
  const start = cellOf(startPt.cx, startPt.cy)
  // the alerting room is always somewhere you can walk out of
  const wasBlocked = grid.blocked[cellIndex(start.c, start.r)]
  grid.blocked[cellIndex(start.c, start.r)] = 0
  const { dist, prev } = sweep(grid, start)
  grid.blocked[cellIndex(start.c, start.r)] = wasBlocked

  // The room's assigned assembly area first; only if its flag cannot be reached at all
  // (walled in) do we fall back to the next one.
  let best: { zone: MapObject; idx: number; pt: Pt } | null = null
  for (const zone of assignSafeZones(building, room, all)) {
    const goal = goalFor(zone, dist)
    if (goal) { best = { zone, ...goal }; break }
  }
  if (!best) return null

  const cells: Pt[] = []
  for (let i = best.idx; i !== -1; i = prev[i]) { const c = i % cols, r = (i - c) / cols; cells.push({ cx: (c + 0.5) * CELL, cy: (r + 0.5) * CELL }) }
  cells.reverse()

  // Keep only the cells where the walk changes direction, then pull the string tight.
  const raw: Pt[] = [startPt]
  for (let k = 1; k < cells.length - 1; k++) {
    const a = cells[k - 1], b = cells[k], c = cells[k + 1]
    if (Math.sign(b.cx - a.cx) !== Math.sign(c.cx - b.cx) || Math.sign(b.cy - a.cy) !== Math.sign(c.cy - b.cy)) raw.push(b)
  }
  raw.push(best.pt)

  const clear = (a: Pt, b: Pt) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.cx - a.cx, b.cy - a.cy) / 3))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      if (grid.solidAt(a.cx + (b.cx - a.cx) * t, a.cy + (b.cy - a.cy) * t)) return false
    }
    return true
  }
  const pts: Pt[] = [raw[0]]
  let i = 0
  while (i < raw.length - 1) {
    let j = raw.length - 1
    while (j > i + 1 && !clear(raw[i], raw[j])) j--
    pts.push(raw[j]); i = j
  }
  return { safeZone: best.zone, points: pts }
}
