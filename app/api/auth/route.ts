import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { randomInt } from 'crypto';
import { rateLimit, clientIp, tooMany } from '@/lib/rateLimit';
import { maskEmail } from '@/lib/mask';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Trim so a stray space from typing/pasting doesn't make valid credentials "invalid".
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '').trim();
  if (!username || !password)
    return NextResponse.json({ success: false, message: 'Username and password required.' });

  // Rate limit: per IP (generous — campus users share one IP) and per username (strict).
  const ipHit = await rateLimit(`login:ip:${clientIp(req)}`, 30, 10 * 60);
  if (!ipHit.allowed) return tooMany(ipHit.retryAfter, 'login attempts');
  const userHit = await rateLimit(`login:user:${username.toLowerCase()}`, 8, 10 * 60);
  if (!userHit.allowed) return tooMany(userHit.retryAfter, 'login attempts');

  const rows = await sql`
    SELECT user_id, username, full_name, user_type, email, phone
    FROM users WHERE username = ${username} AND password = ${password}
  `;
  if (rows.length === 0)
    return NextResponse.json({ success: false, message: 'Incorrect username or password.' });

  const acct = rows[0];
  if (!acct.email)
    return NextResponse.json({ success: false, message: 'This account has no email on file. Contact your admin.' });

  // Limit how many login codes can be emailed to one account (stops OTP email spam).
  const otpHit = await rateLimit(`login-otp:${acct.user_id}`, 3, 10 * 60);
  if (!otpHit.allowed) return tooMany(otpHit.retryAfter, 'code requests');

  const otp = randomInt(100000, 1000000).toString(); // cryptographically secure (Math.random is not)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await sql`UPDATE users SET login_otp_code=${otp}, login_otp_expires_at=${expiresAt.toISOString()} WHERE user_id=${acct.user_id}`;

  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    console.error('[LOGIN OTP] RESEND_API_KEY is not set — email was NOT sent.');
    return NextResponse.json({ success: false, message: 'Server is missing RESEND_API_KEY. Contact the developer.' });
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AeroGuard BPSU <noreply@aeroguard-bpsu.xyz>',
        to: acct.email,
        subject: 'AeroGuard — Your Login Code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:32px;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
              <div style="font-size:36px">🛡️</div>
              <h2 style="color:#00c2ff;margin:8px 0">AeroGuard</h2>
              <p style="color:#64748b;font-size:13px">BPSU Fire Safety System</p>
            </div>
            <p>Someone is signing in to your account. Enter this code to continue:</p>
            <div style="text-align:center;margin:28px 0">
              <div style="background:#111827;border:2px solid #0072ff;border-radius:12px;padding:20px;display:inline-block">
                <span style="font-size:36px;font-family:monospace;font-weight:bold;letter-spacing:8px;color:#00c2ff">${otp}</span>
              </div>
              <p style="color:#64748b;font-size:12px;margin-top:10px">Expires in 5 minutes</p>
            </div>
            <p style="color:#64748b;font-size:12px;margin-top:24px">If this wasn't you, ignore this email.</p>
          </div>`
      })
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('[LOGIN OTP] Resend API error:', resendRes.status, resendData);
      return NextResponse.json({ success: false, message: `Resend rejected the email: ${resendData?.message || resendRes.statusText}` });
    }

    console.log('[LOGIN OTP] Resend accepted email, id:', resendData?.id);
  } catch (err: any) {
    console.error('[LOGIN OTP] Failed to reach Resend:', err);
    return NextResponse.json({ success: false, message: `Failed to send email: ${err.message}` });
  }

  return NextResponse.json({ success: true, requiresOtp: true, message: `Code sent to ${maskEmail(acct.email)}.`, user_id: acct.user_id });
}