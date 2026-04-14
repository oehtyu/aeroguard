import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT device_id, device_name, building, floor, room, status FROM devices ORDER BY device_id ASC`;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { device_id, device_name, building, floor, room, status } = await req.json();
  if (!device_id?.trim()) return NextResponse.json({ success: false, message: 'Device ID is required.' });
  if (!device_name?.trim()) return NextResponse.json({ success: false, message: 'Device name is required.' });
  if (!building) return NextResponse.json({ success: false, message: 'Building is required.' });

  const id = device_id.trim().toUpperCase();
  const existing = await sql`SELECT device_id FROM devices WHERE device_id = ${id}`;
  if (existing.length > 0) return NextResponse.json({ success: false, message: 'Device ID already exists.' });

  await sql`INSERT INTO devices (device_id, device_name, building, floor, room, status) VALUES (${id}, ${device_name.trim()}, ${building}, ${floor}, ${room}, ${status || 'Online'})`;
  return NextResponse.json({ success: true, message: 'Device added.' });
}

export async function PUT(req: NextRequest) {
  const { device_id, device_name, building, floor, room, status } = await req.json();
  if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });
  if (!device_name?.trim()) return NextResponse.json({ success: false, message: 'Device name is required.' });

  await sql`UPDATE devices SET device_name=${device_name.trim()}, building=${building}, floor=${floor}, room=${room}, status=${status}, last_update=NOW() WHERE device_id=${device_id}`;
  return NextResponse.json({ success: true, message: 'Device updated.' });
}

export async function DELETE(req: NextRequest) {
  const { device_id } = await req.json();
  if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });
  // Remove linked incidents first to avoid FK constraint
  await sql`DELETE FROM incidents WHERE device_id=${device_id}`;
  await sql`DELETE FROM devices WHERE device_id=${device_id}`;
  return NextResponse.json({ success: true, message: 'Device and its incidents deleted.' });
}