import sql from './db';

const IPROG_API_TOKEN = process.env.IPROGSMS_API_KEY!;
const IPROG_BULK_URL = 'https://sms.iprogtech.com/api/v1/sms_messages/send_bulk';

// Sends `message` to every Security/DRRM account that has a phone number
// set. IPROG accepts local "09XXXXXXXXX" numbers directly, so no format
// conversion is needed (unlike Semaphore).
export async function sendSmsToResponders(message: string) {
    const users = await sql`
    SELECT phone FROM users
    WHERE user_type IN ('Admin', 'Security', 'DRRM') AND phone IS NOT NULL
  `;
  const numbers = users
    .map((u: any) => (u.phone || '').trim())
    .filter((p: string) => p.length >= 10);

  if (numbers.length === 0) {
    console.warn('[SMS] No Security/DRRM accounts have a valid phone number set — skipping.');
    return;
  }

  try {
    const params = new URLSearchParams({
      api_token: IPROG_API_TOKEN,
      message,
      phone_number: numbers.join(','),
    });
    const res = await fetch(`${IPROG_BULK_URL}?${params.toString()}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[SMS] IPROG rejected the request:', res.status, data);
    } else {
      console.log('[SMS] Sent to', numbers.length, 'recipient(s):', data);
    }
  } catch (err: any) {
    console.error('[SMS] Failed to reach IPROG:', err.message);
  }
}