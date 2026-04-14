import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

// ── Set password after OTP verification ─────────────────────
export async function POST(req: NextRequest) {
  const { user_id, otp, password } = await req.json();
  if (!user_id || !otp || !password)
    return NextResponse.json({ success: false, message: 'user_id, OTP, and password required.' });
  if (password.length < 8)
    return NextResponse.json({ success: false, message: 'Password must be at least 8 characters.' });

  const rows = await sql`SELECT otp_code, otp_expires_at FROM users WHERE user_id=${user_id}`;
  if (rows.length === 0) return NextResponse.json({ success: false, message: 'User not found.' });

  const { otp_code, otp_expires_at } = rows[0];
  if (otp_code !== otp) return NextResponse.json({ success: false, message: 'Invalid OTP.' });
  if (new Date() > new Date(otp_expires_at)) return NextResponse.json({ success: false, message: 'OTP expired. Contact your admin to resend.' });

  await sql`
    UPDATE users SET password=${password}, is_verified=true, otp_code=NULL, otp_expires_at=NULL
    WHERE user_id=${user_id}
  `;

  return NextResponse.json({ success: true, message: 'Password set. You can now log in.' });
}

// ── Self-service change password (logged-in user) ────────────
export async function PUT(req: NextRequest) {
  const { user_id, current_password, new_password } = await req.json();
  if (!user_id || !current_password || !new_password)
    return NextResponse.json({ success: false, message: 'All fields required.' });
  if (new_password.length < 8)
    return NextResponse.json({ success: false, message: 'New password must be at least 8 characters.' });

  const rows = await sql`SELECT user_id FROM users WHERE user_id=${user_id} AND password=${current_password}`;
  if (rows.length === 0) return NextResponse.json({ success: false, message: 'Current password is incorrect.' });

  await sql`UPDATE users SET password=${new_password} WHERE user_id=${user_id}`;
  return NextResponse.json({ success: true, message: 'Password changed successfully.' });
}