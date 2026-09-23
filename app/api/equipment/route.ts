import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

const TYPES = new Set(['ABC', 'CO2', 'Water', 'Foam']);
const STATUSES = new Set(['Active', 'Maintenance', 'Expired']);

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// Where the extinguisher sits on the map, stored as an offset from its
// building's top-left corner. Added on first use so no manual migration is
// needed (equivalent SQL: ALTER TABLE fire_equipment ADD COLUMN map_x DOUBLE
// PRECISION, ADD COLUMN map_y DOUBLE PRECISION).
let mapColumns: boolean | null = null;
async function ensureMapColumns() {
  if (mapColumns !== null) return mapColumns;
  try {
    await sql`ALTER TABLE fire_equipment ADD COLUMN IF NOT EXISTS map_x DOUBLE PRECISION`;
    await sql`ALTER TABLE fire_equipment ADD COLUMN IF NOT EXISTS map_y DOUBLE PRECISION`;
    mapColumns = true;
  } catch (err) {
    console.error('[EQUIPMENT] could not add map_x/map_y columns:', err);
    mapColumns = false;
  }
  return mapColumns;
}

// One extinguisher per (building, floor, location). Compared case- and
// whitespace-insensitively so "Near Room 101 " and "near room 101" collide.
async function findAtLocation(building: string, floor: string, desc: string, excludeId = 0) {
  // excludeId = 0 matches no row, so the same query serves create and edit.
  const rows = await sql`
    SELECT equipment_id, equipment_type FROM fire_equipment
    WHERE LOWER(TRIM(building)) = LOWER(${building})
      AND LOWER(TRIM(floor)) = LOWER(${floor})
      AND LOWER(TRIM(location_description)) = LOWER(${desc})
      AND equipment_id <> ${excludeId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function taken(building: string, floor: string, desc: string, hit: any) {
  return NextResponse.json(
    {
      success: false,
      message: `${floor} — ${desc} in ${building} already has a ${hit.equipment_type} extinguisher (ID #${hit.equipment_id}). Pick a different location or edit that one.`,
    },
    { status: 409 }
  );
}

function validate(b: any) {
  const equipment_type = clean(b.equipment_type);
  const building = clean(b.building);
  const floor = clean(b.floor) || '1F';
  const location_description = clean(b.location_description);
  const status = clean(b.status) || 'Active';
  const last_inspection = clean(b.last_inspection) || null;

  if (!equipment_type) return { error: 'Equipment type is required.' };
  if (!TYPES.has(equipment_type)) return { error: `Type must be one of: ${Array.from(TYPES).join(', ')}.` };
  if (!building) return { error: 'Building is required.' };
  if (!location_description) return { error: 'Location is required.' };
  if (!STATUSES.has(status)) return { error: `Status must be one of: ${Array.from(STATUSES).join(', ')}.` };
  if (last_inspection && Number.isNaN(Date.parse(last_inspection))) return { error: 'Last inspection is not a valid date.' };
  return { value: { equipment_type, building, floor, location_description, status, last_inspection } };
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const rows = (await ensureMapColumns())
      ? await sql`
          SELECT equipment_id, equipment_type, building, floor, location_description, status, last_inspection, map_x, map_y
          FROM fire_equipment ORDER BY equipment_id ASC
        `
      : await sql`
          SELECT equipment_id, equipment_type, building, floor, location_description, status, last_inspection
          FROM fire_equipment ORDER BY equipment_id ASC
        `;
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('[EQUIPMENT GET]', err);
    return NextResponse.json({ success: false, message: `Failed to load equipment: ${err.message}` });
  }
}

export async function POST(req: NextRequest) {
  try {
    const v = validate(await req.json());
    if (v.error) return NextResponse.json({ success: false, message: v.error }, { status: 400 });
    const e = v.value!;

    const hit = await findAtLocation(e.building, e.floor, e.location_description);
    if (hit) return taken(e.building, e.floor, e.location_description, hit);

    const rows = await sql`
      INSERT INTO fire_equipment (equipment_type, building, floor, location_description, status, last_inspection)
      VALUES (${e.equipment_type}, ${e.building}, ${e.floor}, ${e.location_description}, ${e.status}, ${e.last_inspection})
      RETURNING equipment_id
    `;
    return NextResponse.json({ success: true, message: 'Equipment added.', equipment_id: rows[0]?.equipment_id });
  } catch (err: any) {
    console.error('[EQUIPMENT POST]', err);
    return NextResponse.json({ success: false, message: `Could not save extinguisher: ${err.message}` }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const equipment_id = Number(body.equipment_id);
    if (!equipment_id) return NextResponse.json({ success: false, message: 'Equipment ID is required.' }, { status: 400 });

    // Map Editor: only the marker position changed (admins only).
    if (body.position_only) {
      const admin = await sql`SELECT user_type FROM users WHERE user_id=${Number(body.admin_id) || 0}`;
      if (admin[0]?.user_type !== 'Admin') return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
      const x = Number(body.map_x), y = Number(body.map_y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return NextResponse.json({ success: false, message: 'Invalid position.' }, { status: 400 });
      if (!(await ensureMapColumns())) return NextResponse.json({ success: false, message: 'Database could not store map positions (map_x / map_y columns missing).' }, { status: 500 });
      await sql`UPDATE fire_equipment SET map_x=${x}, map_y=${y} WHERE equipment_id=${equipment_id}`;
      return NextResponse.json({ success: true, message: 'Position saved.' });
    }

    const v = validate(body);
    if (v.error) return NextResponse.json({ success: false, message: v.error }, { status: 400 });
    const e = v.value!;

    const hit = await findAtLocation(e.building, e.floor, e.location_description, equipment_id);
    if (hit) return taken(e.building, e.floor, e.location_description, hit);

    const before = (await sql`SELECT building, floor, location_description FROM fire_equipment WHERE equipment_id=${equipment_id}`)[0];
    await sql`
      UPDATE fire_equipment
      SET equipment_type=${e.equipment_type}, building=${e.building}, floor=${e.floor},
          location_description=${e.location_description}, status=${e.status}, last_inspection=${e.last_inspection}
      WHERE equipment_id=${equipment_id}
    `;
    // Re-assigned to a different building/floor/location? Then the old drag position no
    // longer applies — clear it so the marker re-appears at its new designated spot.
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const moved = before && (norm(before.building) !== norm(e.building) || norm(before.floor) !== norm(e.floor) || norm(before.location_description) !== norm(e.location_description));
    if (moved && (await ensureMapColumns())) {
      await sql`UPDATE fire_equipment SET map_x=NULL, map_y=NULL WHERE equipment_id=${equipment_id}`;
    }
    return NextResponse.json({ success: true, message: 'Equipment updated.' });
  } catch (err: any) {
    console.error('[EQUIPMENT PUT]', err);
    return NextResponse.json({ success: false, message: `Could not update extinguisher: ${err.message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { equipment_id } = await req.json();
    if (!equipment_id) return NextResponse.json({ success: false, message: 'Equipment ID is required.' }, { status: 400 });
    await sql`DELETE FROM fire_equipment WHERE equipment_id=${Number(equipment_id)}`;
    return NextResponse.json({ success: true, message: 'Equipment deleted.' });
  } catch (err: any) {
    console.error('[EQUIPMENT DELETE]', err);
    return NextResponse.json({ success: false, message: `Could not delete extinguisher: ${err.message}` }, { status: 500 });
  }
}
