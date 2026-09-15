import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/reports?user_id=12        -> that user's own reports (regular users)
// GET /api/reports?all=1             -> every report (admin Incident Log view)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    const all = searchParams.get('all');

    const rows = all
      ? await sql`SELECT * FROM incident_reports ORDER BY created_at DESC LIMIT 200`
      : user_id
      ? await sql`SELECT * FROM incident_reports WHERE user_id=${user_id} ORDER BY created_at DESC`
      : [];

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error('[GET REPORTS] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to load reports: ${err.message}` });
  }
}

// PUT /api/reports — submit a completed report. Only allowed while it's
// still Incomplete and only by the user who owns it; once Submitted, no
// further edits are possible (matches "no further actions until then").
export async function PUT(req: NextRequest) {
  try {
    const { report_id, user_id, actions_taken, remarks } = await req.json();
    if (!report_id || !user_id) return NextResponse.json({ success: false, message: 'report_id and user_id are required.' });
    if (!actions_taken?.trim()) return NextResponse.json({ success: false, message: 'Please describe the actions you took.' });

    const existing = await sql`SELECT report_id, user_id, status FROM incident_reports WHERE report_id=${report_id}`;
    if (existing.length === 0) return NextResponse.json({ success: false, message: 'Report not found.' });
    if (String(existing[0].user_id) !== String(user_id)) return NextResponse.json({ success: false, message: 'This report does not belong to you.' });
    if (existing[0].status === 'Submitted') return NextResponse.json({ success: false, message: 'This report was already submitted.' });

    await sql`
      UPDATE incident_reports
      SET actions_taken=${actions_taken}, remarks=${remarks || null}, status='Submitted', submitted_at=NOW()
      WHERE report_id=${report_id}
    `;
    return NextResponse.json({ success: true, message: 'Report submitted.' });
  } catch (err: any) {
    console.error('[SUBMIT REPORT] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to submit report: ${err.message}` });
  }
}