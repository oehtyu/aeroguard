import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const { username } = await req.json();
  if (!username)
    return NextResponse.json({ success: false, message: 'Please enter your username.' });

  const GENERIC = 'If that username exists, a password reset link has been sent to the registered email.';

  const rows = await sql`SELECT user_id, email, full_name FROM users WHERE username=${username}`;
  if (rows.length === 0) {
    // Don't reveal whether the username exists — same generic response either way.
    return NextResponse.json({ success: true, message: GENERIC });
  }

  const acct = rows[0];
  if (!acct.email) {
    console.error(`[FORGOT PASSWORD] User ${username} has no email on file.`);
    return NextResponse.json({ success: true, message: GENERIC });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await sql`UPDATE users SET otp_code=${otp}, otp_expires_at=${expiresAt.toISOString()} WHERE user_id=${acct.user_id}`;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[FORGOT PASSWORD] RESEND_API_KEY is not set — email was NOT sent.');
    return NextResponse.json({ success: true, message: GENERIC }); // still generic to the user
  }

  const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/set-password?uid=${acct.user_id}&amp;otp=${otp}`;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AeroGuard BPSU <noreply@aeroguard-bpsu.xyz>',
        to: acct.email,
        subject: 'AeroGuard — Reset Your Password',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:32px;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
              <div style="font-size:36px">🛡️</div>
              <h2 style="color:#00c2ff;margin:8px 0">AeroGuard</h2>
              <p style="color:#64748b;font-size:13px">BPSU Fire Safety System</p>
            </div>
            <p>We received a request to reset the password for account <strong>${username}</strong>. Click below to choose a new password:</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${resetLink}"
                style="background:linear-gradient(135deg,#0072ff,#00c2ff);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:15px">
                Reset My Password
              </a>
              <p style="color:#64748b;font-size:12px;margin-top:14px">This link expires in 15 minutes.</p>
            </div>
            <p style="color:#64748b;font-size:11px;margin-top:20px;word-break:break-all">Button not working? Copy this link into your browser:<br/>
              <span style="color:#00c2ff">${resetLink}</span>
            </p>
            <p style="color:#64748b;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email — your password will not be changed.</p>
          </div>
        `
      })
    });

    if (!resendRes.ok) {
      const resendData = await resendRes.json();
      console.error('[FORGOT PASSWORD] Resend API error:', resendRes.status, resendData);
    }
  } catch (err: any) {
    console.error('[FORGOT PASSWORD] Failed to reach Resend:', err);
  }

  // Always generic to the client, regardless of what happened above
  return NextResponse.json({ success: true, message: GENERIC });
}