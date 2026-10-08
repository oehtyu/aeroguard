import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getSessionUserId, unauthorized } from '@/lib/guard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/reports?user_id=12        -> that user's own reports (regular users)
// GET /api/reports?all=1             -> every report (admin Incident Log view)
// GET /api/reports?report_id=7&user_id=12 -> that ONE report, WITH its photo (see below)
//
// The dashboard polls this endpoint every few seconds from every open tab, for as long
// as anyone has it open. The list forms below deliberately never select photo_data: a
// submitted report's photo is a base64 image, often several hundred KB, and re-sending
// every photo of every report to every open tab every few seconds is what was driving
// the Vercel "Fast Origin Transfer" usage up — data transferred out scales with
// (poll interval) x (open tabs) x (total photo bytes), not with how many people are
// actually looking at a photo right now. `has_photo` tells the UI a photo exists; the
// actual bytes are fetched once, only if someone opens that report (see report_id below).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Identity from the session cookie — the ?user_id= in the URL is ignored.
    const sessionId = await getSessionUserId(req);
    if (!sessionId) return unauthorized();
    const user_id = String(sessionId);
    const all = searchParams.get('all');
    const report_id = searchParams.get('report_id');

    // Single report, on demand — this is the ONLY path that ever selects photo_data.
    if (report_id) {
      const rows = await sql`
        SELECT r.*, u.user_type AS responder_role, COALESCE(r.full_name, u.full_name) AS responder_name
        FROM incident_reports r LEFT JOIN users u ON u.user_id = r.user_id
        WHERE r.report_id=${report_id}`;
      const report = rows[0];
      if (!report) return NextResponse.json({ success: false, message: 'Report not found.' });

      // Same access rule as everywhere else in this app: the report's own owner, or an Admin.
      let allowed = user_id && String(report.user_id) === String(user_id);
      if (!allowed && user_id) {
        const requester = await sql`SELECT user_type FROM users WHERE user_id=${user_id}`;
        allowed = requester[0]?.user_type === 'Admin';
      }
      if (!allowed) return NextResponse.json({ success: false, message: 'You do not have access to this report.' });

      return NextResponse.json({ success: true, data: report });
    }

    // The responder's role comes from the users table, so every report (old or new)
    // shows it and it stays correct if an admin changes someone's role.
    const rows = all
      ? await sql`
          SELECT r.report_id, r.device_id, r.incident_id, r.user_id, r.location, r.threat_level, r.status,
                 r.actions_taken, r.remarks, r.created_at, r.submitted_at, (r.photo_data IS NOT NULL) AS has_photo,
                 u.user_type AS responder_role, COALESCE(r.full_name, u.full_name) AS responder_name
          FROM incident_reports r LEFT JOIN users u ON u.user_id = r.user_id
          ORDER BY r.created_at DESC LIMIT 200`
      : user_id
      ? await sql`
          SELECT r.report_id, r.device_id, r.incident_id, r.user_id, r.location, r.threat_level, r.status,
                 r.actions_taken, r.remarks, r.created_at, r.submitted_at, (r.photo_data IS NOT NULL) AS has_photo,
                 u.user_type AS responder_role, COALESCE(r.full_name, u.full_name) AS responder_name
          FROM incident_reports r LEFT JOIN users u ON u.user_id = r.user_id
          WHERE r.user_id=${user_id} ORDER BY r.created_at DESC`
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
        const { report_id, actions_taken, remarks, photo_data } = await req.json();
    const sessionId = await getSessionUserId(req);   // report owner = the signed-in user, not whatever the body says
    if (!sessionId) return unauthorized();
    const user_id = String(sessionId);
    if (!report_id || !user_id) return NextResponse.json({ success: false, message: 'report_id and user_id are required.' });
    if (!actions_taken?.trim()) return NextResponse.json({ success: false, message: 'Please describe the actions you took.' });

    const existing = await sql`SELECT report_id, user_id, status FROM incident_reports WHERE report_id=${report_id}`;
    if (existing.length === 0) return NextResponse.json({ success: false, message: 'Report not found.' });
    if (String(existing[0].user_id) !== String(user_id)) return NextResponse.json({ success: false, message: 'This report does not belong to you.' });
    if (existing[0].status === 'Submitted') return NextResponse.json({ success: false, message: 'This report was already submitted.' });

        await sql`
      UPDATE incident_reports
      SET actions_taken=${actions_taken}, remarks=${remarks || null}, photo_data=${photo_data || null}, status='Submitted', submitted_at=NOW()
      WHERE report_id=${report_id}
    `;
    return NextResponse.json({ success: true, message: 'Report submitted.' });
  } catch (err: any) {
    console.error('[SUBMIT REPORT] Failed:', err);
    return NextResponse.json({ success: false, message: `Failed to submit report: ${err.message}` });
  }
}