import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT * FROM fire_equipment ORDER BY equipment_id ASC`;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { equipment_type, building, floor, location_description, last_inspection, status } = await req.json();
  const rows = await sql`
    INSERT INTO fire_equipment (equipment_type, building, floor, location_description, last_inspection, status)
    VALUES (${equipment_type}, ${building}, ${floor}, ${location_description}, ${last_inspection || null}, ${status})
    RETURNING equipment_id
  `;
  return NextResponse.json({ success: true, message: 'Equipment added.', equipment_id: rows[0].equipment_id });
}

export async function DELETE(req: NextRequest) {
  const { equipment_id } = await req.json();
  await sql`DELETE FROM fire_equipment WHERE equipment_id=${equipment_id}`;
  return NextResponse.json({ success: true, message: 'Equipment deleted.' });
}
