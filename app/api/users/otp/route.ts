import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

// ── Generate a 6-digit OTP and store it ──────────────────────
export async function POST(req: NextRequest) {
  const { email, user_id } = await req.json();
  if (!email || !user_id)
    return NextResponse.json({ success: false, message: 'Email and user_id required.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // Store OTP in DB
  await sql`
    UPDATE users SET otp_code=${otp}, otp_expires_at=${expiresAt.toISOString()}, is_verified=false
    WHERE user_id=${user_id}
  `;

  // Send via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AeroGuard BPSU <noreply@aeroguard.bpsu.edu.ph>',
        to: email,
        subject: 'AeroGuard — Your OTP Code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#0a0e1a;color:#e2e8f0;padding:32px;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
              <div style="font-size:36px">🛡️</div>
              <h2 style="color:#00c2ff;margin:8px 0">AeroGuard</h2>
              <p style="color:#64748b;font-size:13px">BPSU Fire Safety System</p>
            </div>
            <p>An account has been created for you. Use the OTP below to verify and set your password:</p>
            <div style="text-align:center;margin:28px 0">
              <div style="background:#111827;border:2px solid #0072ff;border-radius:12px;padding:20px;display:inline-block">
                <span style="font-size:36px;font-family:monospace;font-weight:bold;letter-spacing:8px;color:#00c2ff">${otp}</span>
              </div>
              <p style="color:#64748b;font-size:12px;margin-top:10px">Expires in 15 minutes</p>
            </div>
            <p>Click the link below to set your password:</p>
            <div style="text-align:center;margin:20px 0">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/set-password?uid=${user_id}&otp=${otp}"
                style="background:linear-gradient(135deg,#0072ff,#00c2ff);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
                Set My Password
              </a>
            </div>
            <p style="color:#64748b;font-size:12px;margin-top:24px">If you did not request this account, please ignore this email. The account will remain inactive until a password is set.</p>
          </div>
        `
      })
    });
  }

  return NextResponse.json({ success: true, message: `OTP sent to ${email}.` });
}

// ── Verify OTP ───────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const { user_id, otp } = await req.json();
  if (!user_id || !otp)
    return NextResponse.json({ success: false, message: 'user_id and OTP required.' });

  const rows = await sql`SELECT otp_code, otp_expires_at FROM users WHERE user_id=${user_id}`;
  if (rows.length === 0) return NextResponse.json({ success: false, message: 'User not found.' });

  const { otp_code, otp_expires_at } = rows[0];
  if (otp_code !== otp) return NextResponse.json({ success: false, message: 'Invalid OTP.' });
  if (new Date() > new Date(otp_expires_at)) return NextResponse.json({ success: false, message: 'OTP has expired. Please contact your admin.' });

  return NextResponse.json({ success: true, message: 'OTP verified.' });
}