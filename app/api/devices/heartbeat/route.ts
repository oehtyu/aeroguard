import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { sendPushToAll } from '@/lib/push';
import { sendSmsToResponders } from '@/lib/sms';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LEVEL_RANK: Record<string, number> = { Gray: 0, Yellow: 1, Orange: 2, Red: 3 };
const SEVERITY_MESSAGE: Record<string, string> = {
  Yellow: 'Low-level smoke or vapor detected. Please stay alert.',
  Orange: 'High smoke level detected. Possible fire — assistance may be needed.',
  Red: 'Critical smoke level detected. Fire emergency — follow evacuation procedures.',
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT device_id, device_name, building, floor, room, status,
             pm25_value, pm10_value, temperature, humidity, current_threat, last_update,
             sensor_read_at, pi_sent_at, server_received_at, peak_threat
      FROM devices ORDER BY device_id ASC
    `;
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('[GET HEARTBEAT] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to load devices: ${err.message}` });
  }
}

export async function POST(req: NextRequest) {
  const server_received_at = new Date().toISOString();

  try {
    const { device_id, pm25_value, pm10_value, temperature, humidity, threat_level,
            sensor_read_at, pi_sent_at } = await req.json();

    if (!device_id) return NextResponse.json({ success: false, message: 'Device ID is required.' });
    if (!threat_level) return NextResponse.json({ success: false, message: 'Threat level is required.' });

    const existing = await sql`SELECT device_id, building, floor, room, peak_threat FROM devices WHERE device_id = ${device_id}`;
    if (existing.length === 0)
      return NextResponse.json({ success: false, message: `Unknown device_id "${device_id}" — add it in the dashboard first.` });

    const device = existing[0];
    const newRank = LEVEL_RANK[threat_level] ?? 0;
    const prevPeak = device.peak_threat || 'Gray';
    const prevPeakRank = LEVEL_RANK[prevPeak] ?? 0;

    // Reset point: back to Gray means the event is fully over — the next
    // escalation starts a brand new cycle and will notify from Yellow again.
    const nextPeak = threat_level === 'Gray' ? 'Gray' : (newRank > prevPeakRank ? threat_level : prevPeak);
    const isNewPeak = threat_level !== 'Gray' && newRank > prevPeakRank;

    await sql`
      UPDATE devices
      SET pm25_value=COALESCE(${pm25_value}, pm25_value),
          pm10_value=COALESCE(${pm10_value}, pm10_value),
          temperature=COALESCE(${temperature}, temperature),
          humidity=COALESCE(${humidity}, humidity),
          current_threat=${threat_level}, peak_threat=${nextPeak}, status='Online', last_update=NOW(),
          sensor_read_at=${sensor_read_at || null},
          pi_sent_at=${pi_sent_at || null},
          server_received_at=${server_received_at}
      WHERE device_id=${device_id}
    `;

    const openIncident = await sql`
      SELECT incident_id, threat_level FROM incidents
      WHERE device_id=${device_id} AND resolved=FALSE
      ORDER BY created_at DESC LIMIT 1
    `;

    if (threat_level === 'Gray') {
      if (openIncident.length > 0) {
        await sql`UPDATE incidents SET resolved=TRUE, resolved_at=NOW() WHERE incident_id=${openIncident[0].incident_id}`;
      }
    } else if (openIncident.length === 0 || openIncident[0].threat_level !== threat_level) {
      if (openIncident.length > 0) {
        await sql`UPDATE incidents SET resolved=TRUE, resolved_at=NOW() WHERE incident_id=${openIncident[0].incident_id}`;
      }
      await sql`
        INSERT INTO incidents (device_id, threat_level, pm25_value, pm10_value, temperature, humidity, location)
        VALUES (${device_id}, ${threat_level}, ${pm25_value}, ${pm10_value}, ${temperature}, ${humidity},
                ${`${device.building}, ${device.floor}, ${device.room}`})
      `;

      // ONLY notify on a genuine escalation past the peak already reached
      // this event — never on the way back down (Red->Orange->Yellow),
      // and never for repeat hits at the same level. Resets automatically
      // once threat_level returns to Gray (see nextPeak/isNewPeak above).
      if (isNewPeak) {
        try {
          await sendPushToAll({
  title: `AeroGuard ${threat_level.toUpperCase()} ALERT`,
  body: `Severity: ${threat_level}. ${SEVERITY_MESSAGE[threat_level]} Location: ${device.building}, ${device.floor}, ${device.room}.`,
  url: '/dashboard',
})
        } catch (e: any) {
          console.error('[PUSH] send failed:', e);
        }
        try {
          await sendSmsToResponders(
  `AEROGUARD ${threat_level.toUpperCase()} ALERT. Severity: ${threat_level}. ${SEVERITY_MESSAGE[threat_level]} Location: ${device.building}, ${device.floor}, ${device.room}. Check AeroGuard now.`
)
        } catch (e: any) {
          console.error('[SMS] send failed:', e);
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Heartbeat received.', server_received_at });
  } catch (err: any) {
    console.error('[HEARTBEAT] Failed:', err);
    return NextResponse.json({ success: false, message: `Heartbeat failed: ${err.message}` });
  }
}