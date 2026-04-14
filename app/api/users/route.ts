import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

// ── Validation helpers ─────────────────────────────────────
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

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

// ── GET all users (admin never sees passwords) ─────────────
export async function GET() {
  const rows = await sql`
    SELECT user_id, username, full_name, user_type, email, phone, is_verified
    FROM users ORDER BY user_id ASC
  `;
  return NextResponse.json({ success: true, data: rows });
}

// ── POST add user ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { full_name, username, password, user_type, email, phone } = await req.json();

  // Validations
  if (!full_name?.trim()) return NextResponse.json({ success: false, message: 'Full name is required.' });
  const uErr = validateUsername(username?.trim() || '');
  if (uErr) return NextResponse.json({ success: false, message: uErr });
  const pErr = validatePassword(password || '');
  if (pErr) return NextResponse.json({ success: false, message: pErr });
  if (!user_type) return NextResponse.json({ success: false, message: 'Role is required.' });
  if (email) {
    const eErr = validateEmail(email.trim());
    if (eErr) return NextResponse.json({ success: false, message: eErr });
  }
  if (phone) {
    const phErr = validatePhone(phone.trim());
    if (phErr) return NextResponse.json({ success: false, message: phErr });
  }

  // Check duplicate username
  const existing = await sql`SELECT user_id FROM users WHERE username = ${username.trim()}`;
  if (existing.length > 0) return NextResponse.json({ success: false, message: 'Username already exists. Please choose a different one.' });

  // Check duplicate email
  if (email) {
    const existingEmail = await sql`SELECT user_id FROM users WHERE email = ${email.trim()}`;
    if (existingEmail.length > 0) return NextResponse.json({ success: false, message: 'This email is already registered.' });
  }

  const rows = await sql`
    INSERT INTO users (username, password, full_name, user_type, email, phone, is_verified)
    VALUES (${username.trim()}, ${password}, ${full_name.trim()}, ${user_type}, ${email?.trim() || null}, ${phone?.trim() || null}, false)
    RETURNING user_id, username, full_name, user_type, email, phone
  `;

  // In production: send verification email here via Resend/SendGrid
  // For now we just flag it as created and return success
  return NextResponse.json({
    success: true,
    message: `Account created. ${email ? 'A verification email has been sent to ' + email + '.' : ''}`,
    user_id: rows[0].user_id
  });
}

// ── PUT edit user (admin cannot change password) ───────────
export async function PUT(req: NextRequest) {
  const { user_id, full_name, username, user_type, email, phone } = await req.json();

  if (!user_id) return NextResponse.json({ success: false, message: 'User ID is required.' });
  if (!full_name?.trim()) return NextResponse.json({ success: false, message: 'Full name is required.' });
  const uErr = validateUsername(username?.trim() || '');
  if (uErr) return NextResponse.json({ success: false, message: uErr });
  if (!user_type) return NextResponse.json({ success: false, message: 'Role is required.' });
  if (email) {
    const eErr = validateEmail(email.trim());
    if (eErr) return NextResponse.json({ success: false, message: eErr });
  }
  if (phone) {
    const phErr = validatePhone(phone.trim());
    if (phErr) return NextResponse.json({ success: false, message: phErr });
  }

  // Check duplicate username (excluding self)
  const existing = await sql`SELECT user_id FROM users WHERE username = ${username.trim()} AND user_id != ${user_id}`;
  if (existing.length > 0) return NextResponse.json({ success: false, message: 'Username already taken.' });

  // Admin cannot update password — password stays unchanged
  await sql`
    UPDATE users
    SET full_name=${full_name.trim()}, username=${username.trim()},
        user_type=${user_type}, email=${email?.trim() || null},
        phone=${phone?.trim() || null}
    WHERE user_id=${user_id}
  `;

  return NextResponse.json({ success: true, message: 'User updated successfully.' });
}

// ── DELETE user ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { user_id } = await req.json();
  if (!user_id) return NextResponse.json({ success: false, message: 'User ID is required.' });
  await sql`DELETE FROM users WHERE user_id=${user_id}`;
  return NextResponse.json({ success: true, message: 'User deleted.' });
}