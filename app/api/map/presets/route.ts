import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function isAdmin(userId: unknown) {
  if (!userId) return false
  const rows = await sql`SELECT user_type FROM users WHERE user_id=${Number(userId)}`
  return rows[0]?.user_type === 'Admin'
}

// GET — list all saved presets (id, name, created_at only — not the full
// layout data, to keep the dropdown list lightweight)
export async function GET() {
  try {
    const rows = await sql`SELECT preset_id, name, created_at FROM map_presets ORDER BY created_at DESC`
    return NextResponse.json({ success: true, data: rows })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

// POST — save the CURRENT live map_objects as a new named preset.
// parent_id (a real DB id) is converted to parent_index (this item's
// position in the snapshot array) so the relationship survives a later
// full wipe-and-reinsert, where the original DB ids won't exist anymore.
export async function POST(req: NextRequest) {
  try {
    const { admin_id, name } = await req.json()
    if (!(await isAdmin(admin_id))) return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 })
    if (!String(name || '').trim()) return NextResponse.json({ success: false, message: 'Preset name is required.' })

    const current = await sql`
      SELECT map_object_id, object_type, name AS obj_name, color, x, y, width, height, parent_id, floor
      FROM map_objects ORDER BY map_object_id ASC
    `
    const idToIndex = new Map(current.map((row: any, idx: number) => [row.map_object_id, idx]))
    const snapshot = current.map((row: any) => ({
      object_type: row.object_type, name: row.obj_name, color: row.color,
      x: row.x, y: row.y, width: row.width, height: row.height, floor: row.floor,
      parent_index: row.parent_id != null ? idToIndex.get(row.parent_id) ?? null : null,
    }))

    const rows = await sql`
      INSERT INTO map_presets (name, data)
      VALUES (${name.trim()}, ${JSON.stringify(snapshot)})
      RETURNING preset_id, name, created_at
    `
    return NextResponse.json({ success: true, data: rows[0] })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

// PUT — LOAD a preset: wipes the current live layout and reinserts the
// preset's snapshot. Non-room items (buildings/areas/walls/gates/safe
// zones) never have a parent, so they're inserted first; rooms are
// inserted second with their parent_index resolved to the real new id
// just created for that building. Destructive on the current layout —
// the frontend confirms with the admin before calling this.
export async function PUT(req: NextRequest) {
  try {
    const { admin_id, preset_id } = await req.json()
    if (!(await isAdmin(admin_id))) return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 })

    const preset = await sql`SELECT data FROM map_presets WHERE preset_id=${Number(preset_id)}`
    if (!preset.length) return NextResponse.json({ success: false, message: 'Preset not found.' })

    const items: any[] = preset[0].data
    await sql`DELETE FROM map_objects`

    const newIdByIndex: Record<number, number> = {}

    // Pass 1: everything that isn't a room (rooms are the only type with a parent)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.object_type === 'room') continue
      const inserted = await sql`
        INSERT INTO map_objects (object_type, name, color, x, y, width, height, parent_id, floor)
        VALUES (${it.object_type}, ${it.name}, ${it.color}, ${it.x}, ${it.y}, ${it.width}, ${it.height}, NULL, ${it.floor})
        RETURNING map_object_id
      `
      newIdByIndex[i] = inserted[0].map_object_id
    }

    // Pass 2: rooms, resolving parent_index -> the real new building id from pass 1
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.object_type !== 'room') continue
      const parentNewId = it.parent_index != null ? newIdByIndex[it.parent_index] ?? null : null
      await sql`
        INSERT INTO map_objects (object_type, name, color, x, y, width, height, parent_id, floor)
        VALUES (${it.object_type}, ${it.name}, ${it.color}, ${it.x}, ${it.y}, ${it.width}, ${it.height}, ${parentNewId}, ${it.floor})
      `
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}

// DELETE — remove a saved preset (does not touch the live map)
export async function DELETE(req: NextRequest) {
  try {
    const { admin_id, preset_id } = await req.json()
    if (!(await isAdmin(admin_id))) return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 })
    await sql`DELETE FROM map_presets WHERE preset_id=${Number(preset_id)}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message })
  }
}