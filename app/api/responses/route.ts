import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function limitForLevel(level: string): number {
  if (level === 'Red') return 10
  if (level === 'Orange') return 5
  return 0
}

async function activeIncident(deviceId: string) {
  const rows = await sql`
    SELECT incident_id, threat_level, location
    FROM incidents
    WHERE device_id = ${deviceId} AND resolved = FALSE
      AND threat_level IN ('Orange', 'Red')
    ORDER BY created_at DESC
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const device_id = searchParams.get('device_id')
    const user_id = searchParams.get('user_id')
    if (!device_id) return NextResponse.json({ success: false, message: 'device_id is required.' })

    const incident = await activeIncident(device_id)
    if (!incident) return NextResponse.json({ success: true, data: null })

    const limit = limitForLevel(incident.threat_level)
    const responders = await sql`
      SELECT ir.user_id, COALESCE(ir.full_name, u.full_name) AS full_name, u.user_type AS role
      FROM incident_responses ir
      LEFT JOIN users u ON u.user_id = ir.user_id
      WHERE ir.incident_id = ${incident.incident_id}
      ORDER BY ir.responded_at ASC
    `

    return NextResponse.json({
      success: true,
      data: {
        incident_id: incident.incident_id,
        threat_level: incident.threat_level,
        location: incident.location,
        limit,
        count: responders.length,
        responders,
        alreadyResponded: user_id
          ? responders.some((r: any) => String(r.user_id) === String(user_id))
          : false,
        full: responders.length >= limit,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { device_id, user_id, full_name } = await req.json()
    if (!device_id || !user_id) {
      return NextResponse.json({ success: false, message: 'device_id and user_id are required.' })
    }

    const incident = await activeIncident(device_id)
    if (!incident) {
      return NextResponse.json({ success: false, message: 'There is no active Orange/Red incident for this device.' })
    }
    const limit = limitForLevel(incident.threat_level)

    // One statement makes the limit check and insert operate on this incident,
    // rather than on every alert this device has ever generated.
    const inserted = await sql`
      INSERT INTO incident_responses (device_id, incident_id, user_id, full_name)
      SELECT ${device_id}, ${incident.incident_id}, ${user_id}, ${full_name || null}
      WHERE (
        SELECT COUNT(*) FROM incident_responses
        WHERE incident_id = ${incident.incident_id}
      ) < ${limit}
      ON CONFLICT (incident_id, user_id) DO NOTHING
      RETURNING id
    `

    if (inserted.length === 0) {
      const count = await sql`SELECT COUNT(*) AS count FROM incident_responses WHERE incident_id = ${incident.incident_id}`
      const message = Number(count[0].count) >= limit
        ? 'Response limit already reached for this alert.'
        : 'You have already responded to this alert.'
      return NextResponse.json({ success: false, message, full: Number(count[0].count) >= limit })
    }

    const report = await sql`
      INSERT INTO incident_reports
        (device_id, incident_id, user_id, full_name, location, threat_level, status)
      VALUES
        (${device_id}, ${incident.incident_id}, ${user_id}, ${full_name || null},
         ${incident.location}, ${incident.threat_level}, 'Incomplete')
      ON CONFLICT (incident_id, user_id) DO NOTHING
      RETURNING report_id
    `

    if (report.length === 0) {
      return NextResponse.json({ success: false, message: 'Response was recorded, but its report could not be created.' })
    }

    return NextResponse.json({ success: true, report_id: report[0].report_id })
  } catch (err: any) {
    console.error('[RESPONSES] Failed:', err)
    return NextResponse.json({ success: false, message: err.message })
  }
}