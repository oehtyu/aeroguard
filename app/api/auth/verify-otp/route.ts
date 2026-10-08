import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { rateLimit, clientIp, tooMany } from '@/lib/rateLimit';
import { createSessionToken, setSessionCookie } from '@/lib/session';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const user_id = Number(body.user_id);
  const otp = String(body.otp ?? '').trim();
  if (!user_id || !otp)
    return NextResponse.json({ success: false, message: 'user_id and OTP required.' });

  // Brute-force protection: a 6-digit code only has 1,000,000 possibilities.
  const ipHit = await rateLimit(`verify:ip:${clientIp(req)}`, 30, 5 * 60);
  if (!ipHit.allowed) return tooMany(ipHit.retryAfter, 'attempts');
  const userHit = await rateLimit(`verify:user:${user_id}`, 5, 5 * 60);
  if (!userHit.allowed) {
    // Burn the current code so it can't be guessed any further.
    await sql`UPDATE users SET login_otp_code=NULL, login_otp_expires_at=NULL WHERE user_id=${user_id}`;
    return tooMany(userHit.retryAfter, 'incorrect codes. Please sign in again to get a new code. Too many attempts');
  }

  const rows = await sql`
    SELECT user_id, username, full_name, user_type, login_otp_code, login_otp_expires_at
    FROM users WHERE user_id=${user_id}
  `;
  if (rows.length === 0) return NextResponse.json({ success: false, message: 'Invalid code.' });

  const acct = rows[0];
  if (!acct.login_otp_code || acct.login_otp_code !== otp)
    return NextResponse.json({ success: false, message: 'Invalid code.' });
  if (new Date() > new Date(acct.login_otp_expires_at))
    return NextResponse.json({ success: false, message: 'Code expired. Please log in again.' });

  await sql`UPDATE users SET login_otp_code=NULL, login_otp_expires_at=NULL WHERE user_id=${user_id}`;

  let token: string;
  try {
    token = await createSessionToken(acct.user_id);
  } catch (err: any) {
    console.error('[VERIFY OTP] Could not create session:', err.message);
    return NextResponse.json({ success: false, message: 'Server is missing JWT_SECRET. Contact the developer.' });
  }

  const { login_otp_code, login_otp_expires_at, ...user } = acct;
  const res = NextResponse.json({ success: true, message: 'Verified.', user });
  setSessionCookie(res, token);
  return res;
}
