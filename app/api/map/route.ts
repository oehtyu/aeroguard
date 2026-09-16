import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TYPES = new Set(['building', 'room', 'tree_area', 'wall', 'gate', 'safe_zone', 'area'])
const MAX_X = 1140
const MAX_Y = 600

async function isAdmin(userId: unknown) {
  if (!userId) return false
  const rows = await sql`SELECT user_type FROM users WHERE user_id=${String(userId)}`
  return rows[0]?.user_type === 'Admin'
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
    const rows = await sql`
      UPDATE map_objects
      SET object_type=${data.object_type}, name=${data.name.trim()}, color=${data.color || '#1e3a5f'},
          x=${Number(data.x)}, y=${Number(data.y)}, width=${Number(data.width)}, height=${Number(data.height)},
          parent_id=${data.parent_id || null}, floor=${data.floor || null}, updated_at=NOW()
      WHERE map_object_id=${Number(data.map_object_id)}
      RETURNING *
    `
    return NextResponse.json({ success: true, data: rows[0] })
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
