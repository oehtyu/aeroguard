import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { sendPushToAll } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// A device is considered offline once its last heartbeat is older than 15 seconds — the
// INTERVAL literal below must be kept in sync with the dashboard's own `effectiveStatus()`
// client-side check (and with the heartbeat interval devices are expected to send at).
//
// There's no scheduled job in this app, so the "device went offline" check rides along on
// this endpoint instead, which every open dashboard already polls every few seconds. The
// UPDATE's WHERE clause only matches devices still marked 'Online' in the database, so even
// if several dashboards poll at once, only the request that actually flips the row sends the
// notification — everyone else's UPDATE simply matches zero rows.
async function flagNewlyOfflineDevices() {
  try {
    const flipped = await sql`
      UPDATE devices SET status='Offline'
      WHERE status='Online' AND last_update < NOW() - INTERVAL '15 seconds'
      RETURNING device_id, device_name, building, floor, room
    `;
    for (const device of flipped) {
      try {
        await sendPushToAll({
          title: 'AeroGuard Device Offline',
          body: `${device.device_name} (${device.device_id}) at ${device.building}, ${device.floor}, ${device.room} stopped sending data.`,
          url: '/dashboard',
        });
      } catch (e: any) {
        console.error('[PUSH] offline notify failed:', e);
      }
    }
  } catch (err: any) {
    console.error('[OFFLINE WATCHDOG] Failed:', err);
  }
}

export async function GET() {
  try {
    await flagNewlyOfflineDevices();
    const rows = await sql`
      SELECT device_id, device_name, building, floor, room, status,
             pm25_value, pm10_value, temperature, humidity, current_threat, last_update,
             sensor_read_at, pi_sent_at, server_received_at
      FROM devices ORDER BY device_id ASC
    `;
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('[GET DEVICES] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to load devices: ${err.message}` });
  }
}

export async function POST(req: NextRequest) {
  try {
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
  } catch (err: any) {
    console.error('[ADD DEVICE] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to add device: ${err.message}` });
  }
}

export async function PUT(req: NextRequest) {
  try {
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
  } catch (err: any) {
    console.error('[UPDATE DEVICE] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to update device: ${err.message}` });
  }
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