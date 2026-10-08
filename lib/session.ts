// Edge-safe session helpers (used by middleware.ts AND route handlers).
// The session is a signed JWT stored in an httpOnly cookie, so client-side JS
// (and anyone poking at DevTools > Local Storage) can never read it.
import { SignJWT, jwtVerify } from 'jose';
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'ag_session';
export const SESSION_SECONDS = 8 * 60 * 60; // 8 hours

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET is missing or shorter than 32 characters.');
  return new TextEncoder().encode(s);
}

export async function createSessionToken(userId: number) {
  // Only the user id goes in the token. Role/name/email are always read from the
  // database, so an admin changing someone's role takes effect immediately.
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the user_id inside a valid token, or null (bad signature, expired, missing secret...). */
export async function readSessionToken(token?: string | null): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}
