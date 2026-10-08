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

// Never let the browser (or its back/forward cache) keep a copy of a page or API answer that
// depends on who is signed in. Without this, "log out -> press Back" can show the old dashboard
// from the cache even though the session cookie is already gone.
function noStore(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const userId = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/api/')) {
    if (isPublic(pathname, req.method) || userId) return noStore(NextResponse.next());
    return noStore(NextResponse.json({ success: false, message: 'Not authenticated. Please sign in again.' }, { status: 401 }));
  }

  // Already signed in? Skip the login screen (so Back/Forward onto /login can't show a stale form).
  if (pathname === '/login') {
    if (userId) return noStore(NextResponse.redirect(new URL('/dashboard', req.url)));
    return noStore(NextResponse.next());
  }

  // Pages: no valid session -> back to login
  if (!userId) return noStore(NextResponse.redirect(new URL('/login', req.url)));
  return noStore(NextResponse.next());
}

export const config = { matcher: ['/api/:path*', '/dashboard/:path*', '/login'] };
