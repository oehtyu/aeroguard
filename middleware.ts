import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/session';

// Routes that must work WITHOUT a session cookie.
function isPublic(path: string, method: string) {
  if (path.startsWith('/api/auth')) return true;                                        // login, verify-otp, forgot-password, logout
  if (path === '/api/devices/heartbeat' && method === 'POST') return true;             // Raspberry Pi nodes (see DEVICE_API_KEY)
  if (path === '/api/users/set-password' && method === 'POST') return true;            // account activation / reset via emailed OTP link
  if (path === '/api/users/otp' && method === 'PUT') return true;                      // the set-password page verifies its OTP link
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const userId = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/api/')) {
    if (isPublic(pathname, req.method) || userId) return NextResponse.next();
    return NextResponse.json({ success: false, message: 'Not authenticated. Please sign in again.' }, { status: 401 });
  }

  // Pages: no valid session -> back to login
  if (!userId) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*', '/dashboard/:path*'] };
