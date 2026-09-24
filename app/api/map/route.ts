import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sameBuilding } from '@/app/components/extinguishers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TYPES = new Set(['building', 'room', 'tree_area', 'wall', 'gate', 'safe_zone', 'area'])
const MAX_X = 1140
const MAX_Y = 600

async function isAdmin(userId: unknown) {
  if (!userId) return false
  const rows = await sql`SELECT user_type FROM users WHERE user_id=${Number(userId)}`
  return rows[0]?.user_type === 'Admin'
}

// Devices, extinguishers and users refer to a building by NAME, so a building that holds rooms must
// have a name no other building uses — otherwise their rooms and locations get mixed together.
// Plain decorative blocks (Post, Trees, ...) may still share a name.
async function nameClash(ownId: number, name: string, ownHasRooms: boolean) {
  const others = await sql`
    SELECT m.map_object_id, m.name,
           (SELECT COUNT(*) FROM map_objects r WHERE r.parent_id = m.map_object_id)::int AS rooms
    FROM map_objects m
    WHERE m.object_type = 'building' AND m.map_object_id <> ${ownId}
  `
  const same = others.filter((o: any) => sameBuilding(o.name, name))
  if (!same.length) return null
  return ownHasRooms || same.some((o: any) => o.rooms > 0) ? same[0] : null
}
const clashMessage = (name: string) =>
  `Another building is already called "${name}". A building with rooms needs its own unique name so devices and extinguishers know which building they belong to.`

// When a building is renamed, move its devices / extinguishers / faculty with it (they store the
// building name as text). If the old name was shared with another building, only the records that
// clearly belong to THIS building's rooms are moved.
async function carryRename(id: number, oldName: string, newName: string) {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const rooms = await sql`SELECT name, floor FROM map_objects WHERE parent_id=${id}`
  const others = await sql`SELECT name FROM map_objects WHERE object_type='building' AND map_object_id <> ${id}`
  const oldIsShared = others.some((o: any) => sameBuilding(o.name, oldName))
  const equipment = await sql`SELECT equipment_id, building, floor, location_description FROM fire_equipment`
  const ownEquipment = equipment.filter((e: any) => sameBuilding(e.building, oldName))
  let devices = 0, extinguishers = 0

  if (!oldIsShared) {
    devices = (await sql`UPDATE devices SET building=${newName} WHERE building=${oldName} RETURNING device_id`).length
    for (const e of ownEquipment) { await sql`UPDATE fire_equipment SET building=${newName} WHERE equipment_id=${e.equipment_id}`; extinguishers++ }
    try { await sql`UPDATE users SET building=${newName} WHERE building=${oldName}` } catch { /* users.building is optional */ }
  } else {
    for (const r of rooms) {
      const floor = r.floor || '1F'
      devices += (await sql`UPDATE devices SET building=${newName} WHERE building=${oldName} AND room=${r.name} AND floor=${floor} RETURNING device_id`).length
      for (const e of ownEquipment) {
        if (norm(e.floor) === norm(floor) && norm(e.location_description) === norm(`Near ${r.name}`)) {
          await sql`UPDATE fire_equipment SET building=${newName} WHERE equipment_id=${e.equipment_id}`; extinguishers++
        }
      }
    }
  }
  return { devices, extinguishers }
}

function validBox(data: any) {
  const values = [data.x, data.y, data.width, data.height].map(Number)
  if (values.some(Number.isNaN)) return false
  const [x, y, width, height] = values
  return x >= 0 && y >= 0 && width >= 20 && height >= 20 && x + width <= MAX_X && y + height <= MAX_Y
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT m.*, parent.name AS parent_name
      FROM map_objects m
      LEFT JOIN map_objects parent ON parent.map_object_id = m.parent_id
      ORDER BY CASE m.object_type WHEN 'building' THEN 1 WHEN 'room' THEN 2 ELSE 3 END,
               m.map_object_id
    `
    return NextResponse.json({ success: true, data: rows })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    if (!(await isAdmin(data.admin_id))) return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 })
    if (!TYPES.has(data.object_type) || !String(data.name || '').trim() || !validBox(data)) {
      return NextResponse.json({ success: false, message: 'Enter a name, valid object type, and an in-map position/size.' }, { status: 400 })
    }
    if (data.object_type === 'room' && !data.parent_id) {
      return NextResponse.json({ success: false, message: 'A room must belong to a building.' }, { status: 400 })
    }
    if (data.object_type === 'building' && await nameClash(0, data.name.trim(), false)) {
      return NextResponse.json({ success: false, message: clashMessage(data.name.trim()) }, { status: 409 })
    }
    if (data.object_type === 'room') {
      const parent = (await sql`SELECT name FROM map_objects WHERE map_object_id=${Number(data.parent_id)} AND object_type='building'`)[0]
      if (!parent) return NextResponse.json({ success: false, message: 'That building no longer exists.' }, { status: 400 })
      if (await nameClash(Number(data.parent_id), parent.name, true)) {
        return NextResponse.json({ success: false, message: `More than one building is called "${parent.name}". Rename this building to something unique first (click it on the map, then edit its name), then add the room.` }, { status: 409 })
      }
    }
    const rows = await sql`
      INSERT INTO map_objects (object_type, name, color, x, y, width, height, parent_id, floor)
      VALUES (${data.object_type}, ${data.name.trim()}, ${data.color || '#1e3a5f'},
              ${Number(data.x)}, ${Number(data.y)}, ${Number(data.width)}, ${Number(data.height)},
              ${data.parent_id || null}, ${data.floor || null})
      RETURNING *
    `
    return NextResponse.json({ success: true, data: rows[0] })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    if (!(await isAdmin(data.admin_id))) return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 })
    if (!data.map_object_id || !TYPES.has(data.object_type) || !String(data.name || '').trim() || !validBox(data)) {
      return NextResponse.json({ success: false, message: 'Invalid map object.' }, { status: 400 })
    }
    const id = Number(data.map_object_id)
    const newName = String(data.name).trim()
    const before = (await sql`SELECT object_type, name FROM map_objects WHERE map_object_id=${id}`)[0]
    const renamedBuilding = data.object_type === 'building' && before?.object_type === 'building' && before.name !== newName
    if (renamedBuilding) {
      const hasRooms = (await sql`SELECT 1 FROM map_objects WHERE parent_id=${id} LIMIT 1`).length > 0
      if (await nameClash(id, newName, hasRooms)) {
        return NextResponse.json({ success: false, message: clashMessage(newName) }, { status: 409 })
      }
    }
    const rows = await sql`
      UPDATE map_objects
      SET object_type=${data.object_type}, name=${data.name.trim()}, color=${data.color || '#1e3a5f'},
          x=${Number(data.x)}, y=${Number(data.y)}, width=${Number(data.width)}, height=${Number(data.height)},
          parent_id=${data.parent_id || null}, floor=${data.floor || null},
          pin_x=${data.pin_x != null ? Number(data.pin_x) : null},
          pin_y=${data.pin_y != null ? Number(data.pin_y) : null},
          updated_at=NOW()
      WHERE map_object_id=${Number(data.map_object_id)}
      RETURNING *
    `
    let moved: { devices: number; extinguishers: number } | undefined
    let warning: string | undefined
    if (renamedBuilding) {
      try { moved = await carryRename(id, before.name, newName) }
      catch (err: any) { console.error('[MAP] rename carry-over failed:', err); warning = 'Renamed, but existing devices/extinguishers could not be moved to the new name automatically.' }
    }
    return NextResponse.json({ success: true, data: rows[0], moved, warning })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { admin_id, map_object_id } = await req.json()
    if (!(await isAdmin(admin_id))) return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 })

    const children = await sql`SELECT map_object_id FROM map_objects WHERE parent_id=${Number(map_object_id)} LIMIT 1`
    if (children.length) return NextResponse.json({ success: false, message: 'Delete or move this building\'s rooms first.' }, { status: 400 })

    const target = await sql`SELECT name, floor, object_type, parent_id FROM map_objects WHERE map_object_id=${Number(map_object_id)}`
    if (!target.length) return NextResponse.json({ success: false, message: 'Map object not found.' }, { status: 404 })
    if (target[0].object_type === 'room') {
      const parent = await sql`SELECT name FROM map_objects WHERE map_object_id=${target[0].parent_id}`
      const devices = await sql`SELECT device_id FROM devices WHERE building=${parent[0]?.name || ''} AND floor=${target[0].floor || ''} AND room=${target[0].name} LIMIT 1`
      if (devices.length) return NextResponse.json({ success: false, message: `Reassign device ${devices[0].device_id} before deleting this room.` }, { status: 400 })
    }
    await sql`DELETE FROM map_objects WHERE map_object_id=${Number(map_object_id)}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}
