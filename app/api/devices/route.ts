import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT device_id, device_name, building, floor, room, status FROM devices ORDER BY device_id ASC`;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { device_id, device_name, building, floor, room, status } = await req.json();
  await sql`INSERT INTO devices (device_id, device_name, building, floor, room, status) VALUES (${device_id.toUpperCase()}, ${device_name}, ${building}, ${floor}, ${room}, ${status})`;
  return NextResponse.json({ success: true, message: 'Device added.' });
}

export async function PUT(req: NextRequest) {
  const { device_id, device_name, building, floor, room, status } = await req.json();
  await sql`UPDATE devices SET device_name=${device_name}, building=${building}, floor=${floor}, room=${room}, status=${status}, last_update=NOW() WHERE device_id=${device_id}`;
  return NextResponse.json({ success: true, message: 'Device updated.' });
}

export async function DELETE(req: NextRequest) {
  const { device_id } = await req.json();
  await sql`DELETE FROM devices WHERE device_id=${device_id}`;
  return NextResponse.json({ success: true, message: 'Device deleted.' });
}
