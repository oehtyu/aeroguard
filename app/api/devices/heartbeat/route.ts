import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { sendPushToAll } from '@/lib/push';

export async function GET() {
  try {
    const rows = await sql`
      SELECT device_id, device_name, building, floor, room, status,
             pm25_value, pm10_value, temperature, humidity, current_threat, last_update
      FROM devices ORDER BY device_id ASC
    `;
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('[GET HEARTBEAT] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to load devices: ${err.message}` });
  }
}

// Sensor nodes call this every ~5s with live readings. This does NOT
// create a device — the device must already exist (added via the
// dashboard's Add Device form). This only updates its live values and
// opens/updates/resolves an incident row as the threat level changes.
export async function POST(req: NextRequest) {
  try {
    const { device_id, pm25_value, pm10_value, temperature, humidity, threat_level } = await req.json();

    if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });
    if (!threat_level) return NextResponse.json({ success: false, message: 'Threat level is required.' });

    const existing = await sql`SELECT device_id, building, floor, room FROM devices WHERE device_id = ${device_id}`;
    if (existing.length === 0)
      return NextResponse.json({ success: false, message: `Unknown device_id "${device_id}" — add it in the dashboard first.` });

    const device = existing[0];

        await sql`
      UPDATE devices
      SET pm25_value=COALESCE(${pm25_value}, pm25_value),
          pm10_value=COALESCE(${pm10_value}, pm10_value),
          temperature=COALESCE(${temperature}, temperature),
          humidity=COALESCE(${humidity}, humidity),
          current_threat=${threat_level}, status='Online', last_update=NOW()
      WHERE device_id=${device_id}
    `;
    const openIncident = await sql`
      SELECT incident_id, threat_level FROM incidents
      WHERE device_id=${device_id} AND resolved=FALSE
      ORDER BY created_at DESC LIMIT 1
    `;

    if (threat_level === 'Gray') {
      // Threat cleared — resolve any incident still open for this device
      if (openIncident.length > 0) {
        await sql`UPDATE incidents SET resolved=TRUE, resolved_at=NOW() WHERE incident_id=${openIncident[0].incident_id}`;
      }
    } else if (openIncident.length === 0 || openIncident[0].threat_level !== threat_level) {
      // New threat, or it changed level (e.g. Yellow -> Orange) — close the
      // old one (if any) and open a fresh incident at the new level
      if (openIncident.length > 0) {
        await sql`UPDATE incidents SET resolved=TRUE, resolved_at=NOW() WHERE incident_id=${openIncident[0].incident_id}`;
      }
            await sql`
        INSERT INTO incidents (device_id, threat_level, pm25_value, pm10_value, temperature, humidity, location)
        VALUES (${device_id}, ${threat_level}, ${pm25_value}, ${pm10_value}, ${temperature}, ${humidity},
                ${`${device.building}, ${device.floor}, ${device.room}`})
      `;
            sendPushToAll({
        title: `${threat_level} Alert — ${device_id}`,
        body: `${device.building}, ${device.floor}, ${device.room} — PM2.5: ${pm25_value ?? '—'} µg/m³`,
        url: '/dashboard',
      }).catch((e: any) => console.error('[PUSH] send failed:', e));
      `;
    }
    // else: same non-Gray level as the already-open incident — just keep updating the device row, no new incident

    return NextResponse.json({ success: true, message: 'Heartbeat received.' });
  } catch (err: any) {
    console.error('[HEARTBEAT] Failed:', err);
    return NextResponse.json({ success: false, message: `Heartbeat failed: ${err.message}` });
  }
    }