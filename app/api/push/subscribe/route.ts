import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    const endpoint = sub.endpoint;
    const p256dh = sub.keys?.p256dh;
    const auth = sub.keys?.auth;
    if (!endpoint || !p256dh || !auth)
      return NextResponse.json({ success: false, message: 'Invalid subscription payload.' });

    await sql`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth)
      VALUES (${endpoint}, ${p256dh}, ${auth})
      ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth
    `;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PUSH SUBSCRIBE] Failed:', err);
    return NextResponse.json({ success: false, message: err.message });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ success: false, message: 'Endpoint required.' });
    await sql`DELETE FROM push_subscriptions WHERE endpoint=${endpoint}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message });
  }
}