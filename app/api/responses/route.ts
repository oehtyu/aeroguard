import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

function limitForLevel(level: string): number {
  if (level === 'Red') return 10;
  if (level === 'Orange') return 5;
  return 0;
}

// GET /api/responses?device_id=AG-001&user_id=12
// Returns current responder count/limit/list for a device, plus whether
// the given user_id has already responded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const device_id = searchParams.get('device_id');
  const user_id = searchParams.get('user_id');
  if (!device_id) return NextResponse.json({ success: false, message: 'device_id is required.' });

  const device = await sql`SELECT current_threat FROM devices WHERE device_id=${device_id}`;
  if (device.length === 0) return NextResponse.json({ success: false, message: 'Unknown device.' });

  const limit = limitForLevel(device[0].current_threat);
  const responders = await sql`
    SELECT user_id, full_name FROM incident_responses
    WHERE device_id=${device_id} ORDER BY responded_at ASC
  `;
  const alreadyResponded = user_id ? responders.some((r: any) => String(r.user_id) === String(user_id)) : false;

  return NextResponse.json({
    success: true,
    data: {
      threat_level: device[0].current_threat,
      limit,
      count: responders.length,
      responders,
      alreadyResponded,
      full: responders.length >= limit,
    },
  });
}

// POST /api/responses — a user accepts to respond to the active incident
// at a device. Atomic: the INSERT only happens if the current count is
// still under that device's current limit, so two people clicking at the
// exact same moment can't both slip in over the cap.
export async function POST(req: NextRequest) {
  const { device_id, user_id, full_name } = await req.json();
  if (!device_id || !user_id) return NextResponse.json({ success: false, message: 'device_id and user_id are required.' });

  const device = await sql`SELECT current_threat FROM devices WHERE device_id=${device_id}`;
  if (device.length === 0) return NextResponse.json({ success: false, message: 'Unknown device.' });

  const limit = limitForLevel(device[0].current_threat);
  if (limit === 0) return NextResponse.json({ success: false, message: 'This device is not currently in an Orange/Red alert.' });

  const inserted = await sql`
    INSERT INTO incident_responses (device_id, user_id, full_name)
    SELECT ${device_id}, ${user_id}, ${full_name || null}
    WHERE (SELECT COUNT(*) FROM incident_responses WHERE device_id=${device_id}) < ${limit}
    ON CONFLICT (device_id, user_id) DO NOTHING
    RETURNING id
  `;

  if (inserted.length === 0) {
    const current = await sql`SELECT COUNT(*) AS c FROM incident_responses WHERE device_id=${device_id}`;
    if (Number(current[0].c) >= limit) {
      return NextResponse.json({ success: false, message: 'Response limit already reached for this alert.', full: true });
    }
    return NextResponse.json({ success: false, message: 'You have already responded to this alert.' });
  }

  return NextResponse.json({ success: true, message: 'Response recorded.' });
}