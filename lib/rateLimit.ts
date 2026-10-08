// Rate limiter backed by the existing Neon database.
// (An in-memory Map does NOT work on Vercel: every serverless instance has its own copy.)
import sql from '@/lib/db';
import { NextRequest } from 'next/server';

let ready: Promise<unknown> | null = null;
function ensureTable() {
  // Best effort only. If the DB user isn't allowed to CREATE tables, ignore the error:
  // the table is expected to already exist (create it once in the Neon SQL Editor).
  if (!ready) {
    ready = sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at TIMESTAMPTZ NOT NULL
      )`.catch((e) => { console.warn('[RATE LIMIT] could not auto-create table, assuming it exists:', e?.message); });
  }
  return ready;
}

/** Counts one hit for `key`. allowed=false once more than `limit` hits happen inside `windowSec`.
 *  If the rate_limits table has any problem, this FAILS OPEN (allows the request and logs the error)
 *  so a rate-limiter problem can never lock everybody out of logging in. */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  try {
    await ensureTable();
    const rows = await sql`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (${key}, 1, NOW() + (${windowSec}::int * INTERVAL '1 second'))
      ON CONFLICT (key) DO UPDATE SET
        count    = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
      RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - NOW()))))::int AS retry_after`;
    if (Math.random() < 0.01) {
      sql`DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 day'`.catch(() => {});
    }
    return { allowed: rows[0].count <= limit, retryAfter: rows[0].retry_after as number };
  } catch (err: any) {
    console.error('[RATE LIMIT] DISABLED (failing open):', err?.message);
    return { allowed: true, retryAfter: 1 };
  }
}

export function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export function tooMany(retryAfter: number, what = 'attempts') {
  const mins = Math.ceil(retryAfter / 60);
  return Response.json(
    { success: false, message: `Too many ${what}. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retry_after: retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}