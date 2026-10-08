import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getSessionUserId, unauthorized } from '@/lib/guard';
import { clearSessionCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Returns the signed-in user, identified by the httpOnly session cookie — NOT by a
// ?user_id= in the URL (that used to let anyone look up any account without logging in).
// The dashboard polls this so an admin's change (role, name, phone, ...) or a deleted
// account shows up within seconds.
export async function GET(req: NextRequest) {
  try {
    const id = await getSessionUserId(req);
    if (!id) return unauthorized();

    const rows = await sql`
      SELECT user_id, username, full_name, user_type, email, phone, building
      FROM users WHERE user_id=${id}
    `;
    if (rows.length === 0) {
      const res = NextResponse.json({ success: false, deleted: true, message: 'Account no longer exists.' }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }
    return NextResponse.json({ success: true, user: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message });
  }
}
