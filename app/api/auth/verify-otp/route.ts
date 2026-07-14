import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const { user_id, otp } = await req.json();
  if (!user_id || !otp)
    return NextResponse.json({ success: false, message: 'user_id and OTP required.' });

  const rows = await sql`
    SELECT user_id, username, full_name, user_type, email, phone, login_otp_code, login_otp_expires_at
    FROM users WHERE user_id=${user_id}
  `;
  if (rows.length === 0) return NextResponse.json({ success: false, message: 'User not found.' });

  const acct = rows[0];
  if (!acct.login_otp_code || acct.login_otp_code !== otp)
    return NextResponse.json({ success: false, message: 'Invalid code.' });
  if (new Date() > new Date(acct.login_otp_expires_at))
    return NextResponse.json({ success: false, message: 'Code expired. Please log in again.' });

  await sql`UPDATE users SET login_otp_code=NULL, login_otp_expires_at=NULL WHERE user_id=${user_id}`;
  const { login_otp_code, login_otp_expires_at, ...user } = acct;
  return NextResponse.json({ success: true, message: 'Verified.', user });
}