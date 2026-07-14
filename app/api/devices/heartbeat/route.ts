import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

// Raspberry Pi calls this every ~5s. Proves it's alive AND carries the live reading.
export async function POST(req: NextRequest) {
  const { device_id, pm25_value, pm10_value, temperature, humidity, threat_level } = await req.json();
  if (!device_id) return NextResponse.json({ success: false, message: 'device_id required.' });

  const rows = await sql`
    UPDATE devices SET
      last_update = NOW(),
      pm25_value = COALESCE(${pm25_value}, pm25_value),
      pm10_value = COALESCE(${pm10_value}, pm10_value),
      temperature = COALESCE(${temperature}, temperature),
      humidity = COALESCE(${humidity}, humidity),
      current_threat = COALESCE(${threat_level}, current_threat)
    WHERE device_id=${device_id}
    RETURNING device_id
  `;
  if (rows.length === 0) return NextResponse.json({ success: false, message: 'Unknown device_id.' });
  return NextResponse.json({ success: true });
}