// ─────────────────────────────────────────────────────────────
// Hand-drawn evacuation routes for the (fixed) campus map.
//
// Every route follows the same easy-to-read pattern:
//   room  →  hallway  →  building exit door  →  walkway  →  EDGE of the assembly area
//
// Routes are made only of straight horizontal / vertical legs (no diagonals), they stay on
// the open ground between buildings, and they STOP just inside the edge of the assembly
// area instead of running across it to its middle. Coordinates use the same 1140×600 space
// as the map in dashboard/page.tsx. If a building or area moves on the map, update it here.
// ─────────────────────────────────────────────────────────────

export type Pt = { cx: number; cy: number }
export type Box = { x: number; y: number; w: number; h: number }

// BPSU DRRM's two real assembly areas.
export const ZONE2: Box = { x: 246, y: 253, w: 300, h: 79 } // the quadrangle — serves Medina Lacson & COAS
export const ZONE3: Box = { x: 834, y: 150, w: 174, h: 88 } // open green area beside CAHS / Library — serves CAHS
export const ZONE_NAMES = { zone2: 'Zone 2 Assembly Area', zone3: 'Zone 3 Assembly Area' } as const
export type ZoneId = keyof typeof ZONE_NAMES

const ARRIVE = 9 // how far inside the area's edge the route stops (px)

type Exit = { x: number; doorY: number; label: string }
type BuildingRoute = {
  zone: ZoneId
  exits: Exit[]
  defaultStart: Pt                         // used when only the building (not a room) is known
  // legs after the walker reaches the hallway at (exit.x, startY)
  after: (exit: Exit, startY: number) => Pt[]
  hallway: string
  exitText: string
  walkText: string
}

const p = (cx: number, cy: number): Pt => ({ cx, cy })

const ROUTES: Record<string, BuildingRoute> = {
  // Medina Lacson (x246-563, y152-231). Two hallways run between the room columns (x=356 has the
  // main staircase). The exit faces SOUTH, straight onto the quadrangle (Zone 2) — short and direct.
  'Medina Lacson Building': {
    zone: 'zone2',
    exits: [{ x: 356, doorY: 231, label: 'EXIT' }, { x: 454, doorY: 231, label: 'EXIT' }],
    defaultStart: p(404, 191), // building's geometric center (246-563, 152-231), not pinned to one exit
    after: (e) => [p(e.x, ZONE2.y + ARRIVE)],
    hallway: 'the main hallway between the room columns',
    exitText: 'the south exit (the side facing the quadrangle)',
    walkText: 'Walk straight south and stop just inside the edge of Zone 2 (the quadrangle).',
  },
  // COAS (x0-166, y375-424). Exit faces NORTH onto the open strip below the quadrangle; follow the
  // strip east, then turn north into the bottom edge of Zone 2. Stays clear of the Chapel and Auto Shop.
  'COAS Building': {
    zone: 'zone2',
    exits: [{ x: 57, doorY: 375, label: 'EXIT' }, { x: 110, doorY: 375, label: 'EXIT' }],
    defaultStart: p(83, 400), // building's geometric center (0-166, 375-424), not pinned to one exit
    after: (e, y) => [p(e.x, 350), p(290, 350), p(290, ZONE2.y + ZONE2.h - ARRIVE)],
    hallway: 'the hallway between the rooms',
    exitText: 'the north exit (facing the quadrangle)',
    walkText: 'Follow the open walkway east, then turn north and stop just inside the edge of Zone 2 (the quadrangle).',
  },
  // CAHS (x622-873, y33-116). Exit faces SOUTH; walk east along the gap above the Library, then
  // south into the top edge of Zone 3.
  'CAHS Building': {
    zone: 'zone3',
    exits: [{ x: 707, doorY: 116, label: 'EXIT' }, { x: 790, doorY: 116, label: 'EXIT' }],
    defaultStart: p(747, 74), // building's geometric center (622-873, 33-116), not pinned to one exit
    after: (e) => [p(e.x, 134), p(855, 134), p(855, ZONE3.y + ARRIVE)],
    hallway: 'the main hallway',
    exitText: 'the south exit',
    walkText: 'Follow the walkway east above the Campus Library, then turn south and stop just inside the edge of Zone 3 (the open green area).',
  },
}

export type EvacRoute = {
  zoneId: ZoneId
  zoneName: string
  points: Pt[]
  exit: { x: number; y: number }
  steps: string[]
}

/** The route for a room (pass its map position) or, with no room, the building's reference route. */
export function getEvacRoute(
  building: string | undefined | null, floor?: string, room?: string, roomPos?: { x: number; y: number } | null,
): EvacRoute | null {
  const cfg = building ? ROUTES[building] : undefined
  if (!cfg) return null

  const start = roomPos ? p(roomPos.x, roomPos.y) : cfg.defaultStart
  const exit = cfg.exits.reduce((best, e) => Math.abs(e.x - start.cx) < Math.abs(best.x - start.cx) ? e : best, cfg.exits[0])

  const pts: Pt[] = [start]
  const push = (q: Pt) => { const last = pts[pts.length - 1]; if (last.cx !== q.cx || last.cy !== q.cy) pts.push(q) }
  push(p(exit.x, start.cy))          // walk to the hallway
  cfg.after(exit, start.cy).forEach(push)

  const upstairs = !!floor && floor !== '1F'
  const steps = [
    `Leave ${room || 'your room'} and walk to ${cfg.hallway}.`,
    ...(upstairs ? [`Take the stairs down from ${floor} to the ground floor (never the elevator).`] : []),
    `Go out through ${cfg.exitText}.`,
    cfg.walkText,
    'Stay in the assembly area and wait for the headcount. Do not go back inside.',
  ]
  return { zoneId: cfg.zone, zoneName: ZONE_NAMES[cfg.zone], points: pts, exit: { x: exit.x, y: exit.doorY }, steps }
}

/** Door markers to draw on the map. */
export const EXIT_DOORS = Object.values(ROUTES).flatMap(r => r.exits.map(e => ({ x: e.x, y: e.doorY, label: e.label })))
export const BUILDING_NAMES = Object.keys(ROUTES)
