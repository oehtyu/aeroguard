import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT device_id, device_name, building, floor, room, status,
           pm25_value, pm10_value, temperature, humidity, current_threat, last_update
    FROM devices ORDER BY device_id ASC
  `;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { device_id, device_name, building, floor, room, status } = await req.json();
  if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });
  if (!device_name) return NextResponse.json({ success: false, message: 'Device name is required.' });
  if (!building) return NextResponse.json({ success: false, message: 'Building is required.' });
  if (!room) return NextResponse.json({ success: false, message: 'Room is required.' });

  const existingId = await sql`SELECT device_id FROM devices WHERE device_id = ${device_id}`;
  if (existingId.length > 0)
    return NextResponse.json({ success: false, message: `Device ID ${device_id} already exists.` });

  const occupied = await sql`
    SELECT device_id FROM devices
    WHERE building = ${building} AND floor = ${floor} AND room = ${room}
  `;
  if (occupied.length > 0)
    return NextResponse.json({ success: false, message: 'That room already has a device assigned. Choose a different room.' });

  await sql`
    INSERT INTO devices (device_id, device_name, building, floor, room, status)
    VALUES (${device_id}, ${device_name}, ${building}, ${floor || '1F'}, ${room}, ${status || 'Online'})
  `;
  return NextResponse.json({ success: true, message: 'Device added.' });
}

export async function PUT(req: NextRequest) {
  const { device_id, device_name, building, floor, room, status } = await req.json();
  if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });

  const occupied = await sql`
    SELECT device_id FROM devices
    WHERE building = ${building} AND floor = ${floor} AND room = ${room}
    AND device_id != ${device_id}
  `;
  if (occupied.length > 0)
    return NextResponse.json({ success: false, message: 'That room already has a device assigned. Choose a different room.' });

  await sql`
    UPDATE devices SET device_name=${device_name}, building=${building}, floor=${floor},
        room=${room}, status=${status}
    WHERE device_id=${device_id}
  `;
  return NextResponse.json({ success: true, message: 'Device updated.' });
}

export async function DELETE(req: NextRequest) {
  const { device_id } = await req.json();
  if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });
  try {
    await sql`DELETE FROM incidents WHERE device_id=${device_id}`;
    await sql`DELETE FROM devices WHERE device_id=${device_id}`;
    return NextResponse.json({ success: true, message: 'Device and its incident history deleted.' });
  } catch (err: any) {
    console.error('[DELETE DEVICE] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to delete device: ${err.message}` });
  }
}