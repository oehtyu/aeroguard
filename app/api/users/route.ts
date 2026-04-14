import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/\s/g, '');
  if (!/^09\d{9}$/.test(clean)) return 'Phone number must start with 09 and be exactly 11 digits.';
  return null;
}
function validateEmail(email: string): string | null {
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  return null;
}
function validateUsername(username: string): string | null {
  if (!username) return 'Username is required.';
  if (username.length < 4) return 'Username must be at least 4 characters.';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, and underscores.';
  return null;
}

// ── GET all users ──────────────────────────────────────────
export async function GET() {
  const rows = await sql`
    SELECT user_id, username, full_name, user_type, email, phone, is_verified
    FROM users ORDER BY user_id ASC
  `;
  return NextResponse.json({ success: true, data: rows });
}

// ── POST create user (admin action — sends OTP to email) ───
export async function POST(req: NextRequest) {
  const { full_name, username, user_type, email, phone } = await req.json();

  if (!full_name?.trim()) return NextResponse.json({ success: false, message: 'Full name is required.' });
  const uErr = validateUsername(username?.trim() || '');
  if (uErr) return NextResponse.json({ success: false, message: uErr });
  if (!user_type) return NextResponse.json({ success: false, message: 'Role is required.' });
  if (!email?.trim()) return NextResponse.json({ success: false, message: 'Email is required to send the OTP.' });
  const eErr = validateEmail(email.trim());
  if (eErr) return NextResponse.json({ success: false, message: eErr });
  if (phone) {
    const phErr = validatePhone(phone.trim());
    if (phErr) return NextResponse.json({ success: false, message: phErr });
  }

  const existingUser = await sql`SELECT user_id FROM users WHERE username = ${username.trim()}`;
  if (existingUser.length > 0) return NextResponse.json({ success: false, message: 'Username already exists.' });
  const existingEmail = await sql`SELECT user_id FROM users WHERE email = ${email.trim()}`;
  if (existingEmail.length > 0) return NextResponse.json({ success: false, message: 'Email already registered.' });

  // Create user with a placeholder password — not usable until OTP verified + password set
  const rows = await sql`
    INSERT INTO users (username, password, full_name, user_type, email, phone, is_verified)
    VALUES (${username.trim()}, '__UNSET__', ${full_name.trim()}, ${user_type}, ${email.trim()}, ${phone?.trim() || null}, false)
    RETURNING user_id, username, full_name, user_type, email
  `;

  return NextResponse.json({
    success: true,
    message: 'Account created. OTP will be sent to the user\'s email.',
    user_id: rows[0].user_id,
    email: rows[0].email
  });
}

// ── PUT — two modes:
//    mode='role'  → admin changes role only (admin_id required)
//    mode='self'  → user edits their own profile (user_id = self)
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { mode } = body;

  // ── Admin: role change only ──────────────────────────────
  if (mode === 'role') {
    const { admin_id, user_id, user_type } = body;
    if (!admin_id || !user_id || !user_type)
      return NextResponse.json({ success: false, message: 'admin_id, user_id, and user_type required.' });
    const admin = await sql`SELECT user_type FROM users WHERE user_id=${admin_id}`;
    if (admin.length === 0 || admin[0].user_type !== 'Admin')
      return NextResponse.json({ success: false, message: 'Only admins can change roles.' });
    await sql`UPDATE users SET user_type=${user_type} WHERE user_id=${user_id}`;
    return NextResponse.json({ success: true, message: 'Role updated.' });
  }

  // ── Self: user edits their own profile ───────────────────
  if (mode === 'self') {
    const { user_id, full_name, username, email, phone } = body;
    if (!user_id) return NextResponse.json({ success: false, message: 'user_id required.' });
    if (!full_name?.trim()) return NextResponse.json({ success: false, message: 'Full name is required.' });
    const uErr = validateUsername(username?.trim() || '');
    if (uErr) return NextResponse.json({ success: false, message: uErr });
    if (email) {
      const eErr = validateEmail(email.trim());
      if (eErr) return NextResponse.json({ success: false, message: eErr });
    }
    if (phone) {
      const phErr = validatePhone(phone.trim());
      if (phErr) return NextResponse.json({ success: false, message: phErr });
    }

    const existing = await sql`SELECT user_id FROM users WHERE username=${username.trim()} AND user_id != ${user_id}`;
    if (existing.length > 0) return NextResponse.json({ success: false, message: 'Username already taken.' });
    if (email) {
      const existEmail = await sql`SELECT user_id FROM users WHERE email=${email.trim()} AND user_id != ${user_id}`;
      if (existEmail.length > 0) return NextResponse.json({ success: false, message: 'Email already in use.' });
    }

    await sql`
      UPDATE users SET full_name=${full_name.trim()}, username=${username.trim()},
        email=${email?.trim() || null}, phone=${phone?.trim() || null}
      WHERE user_id=${user_id}
    `;
    const updated = await sql`SELECT user_id, username, full_name, user_type, email, phone, is_verified FROM users WHERE user_id=${user_id}`;
    return NextResponse.json({ success: true, message: 'Profile updated.', user: updated[0] });
  }

  return NextResponse.json({ success: false, message: 'Invalid mode. Use "role" or "self".' });
}

// ── DELETE user ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { user_id } = await req.json();
  if (!user_id) return NextResponse.json({ success: false, message: 'User ID is required.' });
  await sql`DELETE FROM users WHERE user_id=${user_id}`;
  return NextResponse.json({ success: true, message: 'User deleted.' });
}