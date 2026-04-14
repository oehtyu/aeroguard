import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const { device_id, threat_level } = await req.json();
  if (!device_id || !threat_level)
    return NextResponse.json({ success: false, message: 'device_id and threat_level required.' });

  const devices = await sql`SELECT device_id, building, floor, room FROM devices WHERE device_id = ${device_id}`;
  if (devices.length === 0)
    return NextResponse.json({ success: false, message: 'Device not found in database.' });

  const dev = devices[0];
  const location = `${dev.building}, ${dev.floor}, ${dev.room}`;

  const readings: Record<string, any> = {
    Gray:   { pm25: 12.3,  pm10: 18.5,  temp: 25.0, hum: 62.0, conf: 97.1, action: 'Normal air quality. No action needed.' },
    Yellow: { pm25: 138.7, pm10: 195.2, temp: 28.5, hum: 54.0, conf: 91.3, action: 'Possible vaping/smoking detected. Security notified.' },
    Orange: { pm25: 287.4, pm10: 425.3, temp: 36.2, hum: 47.3, conf: 93.6, action: 'Small fire detected. Security dispatched. Check nearest fire extinguisher.' },
    Red:    { pm25: 521.0, pm10: 780.0, temp: 48.5, hum: 35.0, conf: 96.2, action: 'CRITICAL FIRE. Evacuation initiated. SMS sent to Bureau of Fire Protection.' },
  };

  const r = readings[threat_level];
  if (!r) return NextResponse.json({ success: false, message: 'Invalid threat level. Use Gray, Yellow, Orange, or Red.' });

  const pm25 = parseFloat((r.pm25 + (Math.random() - 0.5) * 10).toFixed(2));
  const pm10 = parseFloat((r.pm10 + (Math.random() - 0.5) * 15).toFixed(2));

  const rows = await sql`
    INSERT INTO incidents (device_id, threat_level, pm25_value, pm10_value, temperature, humidity, confidence, location, response_action)
    VALUES (${device_id}, ${threat_level}, ${pm25}, ${pm10}, ${r.temp}, ${r.hum}, ${r.conf}, ${location}, ${r.action})
    RETURNING incident_id
  `;

  return NextResponse.json({ success: true, message: `Simulated ${threat_level} alert logged for ${device_id}.`, incident_id: rows[0].incident_id });
}