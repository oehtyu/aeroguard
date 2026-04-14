import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT equipment_id, equipment_type, building, floor, location_description, status, last_inspection
    FROM fire_equipment ORDER BY equipment_id ASC
  `;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { equipment_type, building, floor, location_description, status, last_inspection } = await req.json();
  if (!equipment_type) return NextResponse.json({ success: false, message: 'Equipment type is required.' });
  if (!building) return NextResponse.json({ success: false, message: 'Building is required.' });
  if (!location_description) return NextResponse.json({ success: false, message: 'Location is required.' });

  const existing = await sql`
    SELECT equipment_id FROM fire_equipment
    WHERE building = ${building} AND floor = ${floor} AND location_description = ${location_description}
  `;
  if (existing.length > 0)
    return NextResponse.json({ success: false, message: `That location already has a fire extinguisher. Choose a different spot.` });

  await sql`
    INSERT INTO fire_equipment (equipment_type, building, floor, location_description, status, last_inspection)
    VALUES (${equipment_type}, ${building}, ${floor || '1F'}, ${location_description}, ${status || 'Active'}, ${last_inspection || null})
  `;
  return NextResponse.json({ success: true, message: 'Equipment added.' });
}

export async function PUT(req: NextRequest) {
  const { equipment_id, equipment_type, building, floor, location_description, status, last_inspection } = await req.json();
  if (!equipment_id) return NextResponse.json({ success: false, message: 'Equipment ID is required.' });

  const existing = await sql`
    SELECT equipment_id FROM fire_equipment
    WHERE building = ${building} AND floor = ${floor} AND location_description = ${location_description}
    AND equipment_id != ${equipment_id}
  `;
  if (existing.length > 0)
    return NextResponse.json({ success: false, message: `That location already has a fire extinguisher. Choose a different spot.` });

  await sql`
    UPDATE fire_equipment SET equipment_type=${equipment_type}, building=${building}, floor=${floor},
        location_description=${location_description}, status=${status}, last_inspection=${last_inspection || null}
    WHERE equipment_id=${equipment_id}
  `;
  return NextResponse.json({ success: true, message: 'Equipment updated.' });
}

export async function DELETE(req: NextRequest) {
  const { equipment_id } = await req.json();
  if (!equipment_id) return NextResponse.json({ success: false, message: 'Equipment ID is required.' });
  await sql`DELETE FROM fire_equipment WHERE equipment_id=${equipment_id}`;
  return NextResponse.json({ success: true, message: 'Equipment deleted.' });
}