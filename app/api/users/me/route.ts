import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The signed-in browser polls this so an admin's change (role, name, phone, ...)
// or a deleted account shows up within seconds, without logging out and in.
export async function GET(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get('user_id'));
    if (!id) return NextResponse.json({ success: false, message: 'user_id required.' }, { status: 400 });

    const rows = await sql`
      SELECT user_id, username, full_name, user_type, email, phone, building
      FROM users WHERE user_id=${id}
    `;
    if (rows.length === 0) return NextResponse.json({ success: false, deleted: true, message: 'Account no longer exists.' });
    return NextResponse.json({ success: true, user: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message });
  }
}
