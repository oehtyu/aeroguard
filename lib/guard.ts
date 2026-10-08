// Server-side checks for API route handlers. Never trust a user_id / admin_id sent
// in the request body or URL — always take identity from the signed cookie.
import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { SESSION_COOKIE, readSessionToken } from '@/lib/session';

/** user_id of the signed-in user, or null. */
export async function getSessionUserId(req: NextRequest): Promise<number | null> {
  return readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export const unauthorized = () =>
  NextResponse.json({ success: false, message: 'Not authenticated. Please sign in again.' }, { status: 401 });
export const forbidden = () =>
  NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });

/** Signed in as an Admin? Role is read from the DB, not from the token. */
export async function isAdminReq(req: NextRequest): Promise<boolean> {
  const id = await getSessionUserId(req);
  if (!id) return false;
  const rows = await sql`SELECT user_type FROM users WHERE user_id=${id}`;
  return rows[0]?.user_type === 'Admin';
}

/** Usage: const a = await requireAdmin(req); if (a instanceof NextResponse) return a; */
export async function requireAdmin(req: NextRequest): Promise<{ user_id: number } | NextResponse> {
  const id = await getSessionUserId(req);
  if (!id) return unauthorized();
  const rows = await sql`SELECT user_type FROM users WHERE user_id=${id}`;
  if (rows[0]?.user_type !== 'Admin') return forbidden();
  return { user_id: id };
}
