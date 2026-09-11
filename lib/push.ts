import webpush from 'web-push';
import sql from './db';

webpush.setVapidDetails(
  'mailto:aeroguard@bpsu.edu.ph', // contact address the push service can reach you at — can be any real email
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushToAll(payload: { title: string; body: string; url?: string }) {
  const subs = await sql`SELECT id, endpoint, p256dh, auth FROM push_subscriptions`;
  const json = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json
        );
      } catch (err: any) {
        // 404/410 means that subscription is dead (permission revoked, app
        // uninstalled, etc.) — clean it up so we stop wasting sends on it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sql`DELETE FROM push_subscriptions WHERE id=${s.id}`;
        } else {
          console.error('[PUSH] Failed to send to subscription', s.id, err.message);
        }
      }
    })
  );
}