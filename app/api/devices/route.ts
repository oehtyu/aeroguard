export async function GET() {
  const rows = await sql`
    SELECT device_id, device_name, building, floor, room,
      CASE
        WHEN status = 'Maintenance' THEN 'Maintenance'
        WHEN last_update IS NOT NULL AND last_update > NOW() - INTERVAL '20 seconds' THEN 'Online'
        ELSE 'Offline'
      END AS status,
      pm25_value, pm10_value, temperature, humidity,
      COALESCE(current_threat,'Gray') AS current_threat,
      last_update
    FROM devices ORDER BY device_id ASC`;
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

  await sql`INSERT INTO devices (device_id, device_name, building, floor, room, status, last_update) VALUES (${id}, ${device_name.trim()}, ${building}, ${floor}, ${room}, ${status || 'Online'}, NULL)`;
  return NextResponse.json({ success: true, message: 'Device added.' });
}