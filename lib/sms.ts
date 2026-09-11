import sql from './db';

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY!;
const SEMAPHORE_URL = 'https://semaphore.co/api/v4/messages';

// Converts "09171234567" -> "639171234567" (Semaphore's expected format).
// Returns null for anything that doesn't look like a valid PH mobile number.
function toSemaphoreFormat(phone: string): string | null {
  const clean = phone.replace(/\s/g, '');
  if (/^09\d{9}$/.test(clean)) return '63' + clean.slice(1);
  if (/^639\d{9}$/.test(clean)) return clean;
  return null;
}

// Sends `message` to every Security/DRRM account that has a phone number set.
export async function sendSmsToResponders(message: string) {
  const users = await sql`
    SELECT phone FROM users
    WHERE user_type IN ('Security', 'DRRM') AND phone IS NOT NULL
  `;
  const numbers = users
    .map((u: any) => toSemaphoreFormat(u.phone))
    .filter((n: string | null): n is string => n !== null);

  if (numbers.length === 0) {
    console.warn('[SMS] No Security/DRRM accounts have a valid phone number set — skipping.');
    return;
  }

  try {
    const res = await fetch(SEMAPHORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        apikey: SEMAPHORE_API_KEY,
        number: numbers.join(','),
        message,
      }),
    });
    if (!res.ok) {
      console.error('[SMS] Semaphore rejected the request:', res.status, await res.text());
    } else {
      console.log('[SMS] Sent to', numbers.length, 'recipient(s)');
    }
  } catch (err: any) {
    console.error('[SMS] Failed to reach Semaphore:', err.message);
  }
}