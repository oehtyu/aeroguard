import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level');
  const rows = level
    ? await sql`SELECT * FROM incidents WHERE threat_level=${level} ORDER BY created_at DESC LIMIT 100`
    : await sql`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action } = await req.json();
  if (!device_id || !threat_level)
    return NextResponse.json({ success: false, message: 'Device ID and threat level required.' });

  const rows = await sql`
    INSERT INTO incidents (device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action)
    VALUES (${device_id}, ${threat_level}, ${pm25_value}, ${pm10_value}, ${temperature}, ${humidity}, ${confidence}, ${location}, ${response_action})
    RETURNING incident_id
  `;
  return NextResponse.json({ success: true, message: 'Incident logged.', incident_id: rows[0].incident_id });
}

export async function PUT(req: NextRequest) {
  const { incident_id } = await req.json();
  await sql`UPDATE incidents SET resolved=TRUE, resolved_at=NOW() WHERE incident_id=${incident_id}`;
  return NextResponse.json({ success: true, message: 'Incident resolved.' });
}
