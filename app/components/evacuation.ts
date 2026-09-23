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

// tiny binary min-heap keyed by f-score
class Heap {
  private a: { f: number; i: number }[] = []
  get size() { return this.a.length }
  push(f: number, i: number) {
    const a = this.a; a.push({ f, i })
    let k = a.length - 1
    while (k > 0) { const p = (k - 1) >> 1; if (a[p].f <= a[k].f) break; [a[p], a[k]] = [a[k], a[p]]; k = p }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop()!
    if (a.length) {
      a[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === k) break
        ;[a[m], a[k]] = [a[k], a[m]]; k = m
      }
    }
    return top
  }
}

const cache = new Map<string, EvacPlan | null>()

export function planEvacuation(building: MapObject | undefined | null, room: MapObject | undefined | null, all: MapObject[]): EvacPlan | null {
  if (!building) return null
  const key = [building.map_object_id, room?.map_object_id ?? '', ...all.map(o =>
    `${o.map_object_id}:${o.object_type}:${n(o.x)},${n(o.y)},${n(o.width)},${n(o.height)},${o.pin_x ?? ''},${o.pin_y ?? ''}`)].join('|')
  if (cache.has(key)) return cache.get(key)!
  let plan: EvacPlan | null = null
  for (const pad of PADS) { plan = planWithPad(building, room, all, pad); if (plan) break }
  cache.set(key, plan)
  if (cache.size > 12) cache.delete(cache.keys().next().value as string)
  return plan
}

function planWithPad(building: MapObject, room: MapObject | null | undefined, all: MapObject[], PAD: number): EvacPlan | null {
  const zones = all.filter(o => o.object_type === 'safe_zone')
  if (zones.length === 0) return null

  const origin = box(building)
  const solids = all.filter(o => (o.object_type === 'building' && o.map_object_id !== building.map_object_id) || o.object_type === 'wall').map(box)
  const gates = all.filter(o => o.object_type === 'gate').map(box)
  const trees = all.filter(o => o.object_type === 'tree_area').map(box)

  // Solid = inside a padded building/wall, unless it's the origin building or a gate opening.
  const solidAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > W || y > H) return true
    if (inside(origin, x, y)) return false
    if (gates.some(g => inside(g, x, y, PAD))) return false
    return solids.some(s => inside(s, x, y, PAD))
  }

  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL)
  const idx = (c: number, r: number) => r * cols + c
  const cellOf = (x: number, y: number) => ({ c: Math.min(cols - 1, Math.max(0, Math.floor(x / CELL))), r: Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))) })

  const blocked = new Uint8Array(cols * rows)
  const cost = new Float32Array(cols * rows).fill(1)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL
    if (solidAt(x, y)) blocked[idx(c, r)] = 1
    else if (trees.some(t => inside(t, x, y))) cost[idx(c, r)] = TREE_COST
  }

  const startPt: Pt = room ? { cx: n(room.x) + n(room.width, 60) / 2, cy: n(room.y) + n(room.height, 30) / 2 }
                            : { cx: origin.x + origin.w / 2, cy: origin.y + origin.h / 2 }
  const s = cellOf(startPt.cx, startPt.cy)

  // A* from the start to one goal; returns cell path + total cost, or null.
  const search = (goalPt: Pt) => {
    const g = cellOf(goalPt.cx, goalPt.cy)
    // the flag/pin itself must be reachable even if it was dropped near an edge
    const forced: number[] = []
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const c = g.c + dc, r = g.r + dr
      if (c >= 0 && r >= 0 && c < cols && r < rows && blocked[idx(c, r)]) { forced.push(idx(c, r)); blocked[idx(c, r)] = 0 }
    }
    const N = cols * rows
    const best = new Float32Array(N).fill(Infinity)
    const from = new Int32Array(N).fill(-1)
    const heap = new Heap()
    const h = (c: number, r: number) => { const dx = Math.abs(c - g.c), dy = Math.abs(r - g.r); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy) }
    best[idx(s.c, s.r)] = 0; heap.push(h(s.c, s.r), idx(s.c, s.r))
    let found = false
    while (heap.size) {
      const { i } = heap.pop()
      const c = i % cols, r = (i - c) / cols
      if (c === g.c && r === g.r) { found = true; break }
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue
        const nc = c + dc, nr = r + dr
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const ni = idx(nc, nr)
        if (blocked[ni] && !(nc === s.c && nr === s.r)) continue
        // no cutting corners diagonally past a solid
        if (dc && dr && (blocked[idx(c + dc, r)] || blocked[idx(c, r + dr)])) continue
        const step = (dc && dr ? Math.SQRT2 : 1) * cost[ni]
        const cand = best[i] + step
        if (cand < best[ni]) { best[ni] = cand; from[ni] = i; heap.push(cand + h(nc, nr), ni) }
      }
    }
    forced.forEach(i => { blocked[i] = 1 })
    if (!found) return null
    const cells: Pt[] = []
    for (let i = idx(g.c, g.r); i !== -1; i = from[i]) { const c = i % cols, r = (i - c) / cols; cells.push({ cx: (c + 0.5) * CELL, cy: (r + 0.5) * CELL }) }
    cells.reverse()
    return { cells, total: best[idx(g.c, g.r)] }
  }

  // A segment is usable if no sample along it lands in a solid.
  const clear = (a: Pt, b: Pt) => {
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy)
    const steps = Math.max(1, Math.ceil(len / 2))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      if (solidAt(a.cx + (b.cx - a.cx) * t, a.cy + (b.cy - a.cy) * t)) return false
    }
    return true
  }

  let bestPlan: { zone: MapObject; cells: Pt[]; total: number; goal: Pt } | null = null
  for (const zone of zones) {
    const goal = pinPoint(zone)
    const res = search(goal)
    if (res && (!bestPlan || res.total < bestPlan.total)) bestPlan = { zone, cells: res.cells, total: res.total, goal }
  }
  if (!bestPlan) return null

  // exact endpoints, then pull the string tight so the route is a few clean legs
  const raw = [startPt, ...bestPlan.cells.slice(1, -1), bestPlan.goal]
  const pts: Pt[] = [raw[0]]
  let i = 0
  while (i < raw.length - 1) {
    let j = raw.length - 1
    while (j > i + 1 && !clear(raw[i], raw[j])) j--
    pts.push(raw[j]); i = j
  }

  return { safeZone: bestPlan.zone, points: pts }
}
