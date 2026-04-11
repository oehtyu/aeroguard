import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password)
    return NextResponse.json({ success: false, message: 'Username and password required.' });

  const rows = await sql`
    SELECT user_id, username, full_name, user_type, email, phone
    FROM users WHERE username = ${username} AND password = ${password}
  `;

  if (rows.length === 0)
    return NextResponse.json({ success: false, message: 'Incorrect username or password.' });

  return NextResponse.json({ success: true, message: 'Login successful.', user: rows[0] });
}
