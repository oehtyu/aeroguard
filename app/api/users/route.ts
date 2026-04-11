import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT user_id, username, full_name, user_type, email, phone FROM users ORDER BY user_id ASC`;
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const { full_name, username, password, user_type, email, phone } = await req.json();
  if (!full_name || !username || !password || !user_type)
    return NextResponse.json({ success: false, message: 'All fields required.' });

  const rows = await sql`
    INSERT INTO users (username, password, full_name, user_type, email, phone)
    VALUES (${username}, ${password}, ${full_name}, ${user_type}, ${email}, ${phone})
    RETURNING user_id
  `;
  return NextResponse.json({ success: true, message: 'User added.', user_id: rows[0].user_id });
}

export async function PUT(req: NextRequest) {
  const { user_id, full_name, username, user_type, email, phone, password } = await req.json();
  if (password) {
    await sql`UPDATE users SET full_name=${full_name}, username=${username}, user_type=${user_type}, email=${email}, phone=${phone}, password=${password} WHERE user_id=${user_id}`;
  } else {
    await sql`UPDATE users SET full_name=${full_name}, username=${username}, user_type=${user_type}, email=${email}, phone=${phone} WHERE user_id=${user_id}`;
  }
  return NextResponse.json({ success: true, message: 'User updated.' });
}

export async function DELETE(req: NextRequest) {
  const { user_id } = await req.json();
  await sql`DELETE FROM users WHERE user_id=${user_id}`;
  return NextResponse.json({ success: true, message: 'User deleted.' });
}
