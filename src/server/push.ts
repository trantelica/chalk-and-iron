import 'server-only';
import { sendNotification, setVapidDetails, type PushSubscription } from 'web-push';
import { adminClient } from './admin-client';

// Sends notifications to a person's phones with standard Web Push (design
// Section 1). The private key lives only in Vercel's settings.
// The address book is push_subscriptions, saved by the phone with the
// person's own sign-in. (The throwaway iPhone test page and its own address
// book were removed on 19 Nov 2026.)

function configure() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('Notifications are not set up: NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are missing');
  setVapidDetails(process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://chalkandiron.vercel.app', pub, priv);
}

export type Push = { title: string; body: string; url?: string; tag?: string };

/** Sends one notification to every phone the person has allowed. Returns how many it reached. */
export async function sendToPerson(userId: string, push: Push): Promise<{ sent: number; failed: string[] }> {
  configure();
  const admin = adminClient();
  const rows: { endpoint: string; subscription: PushSubscription }[] = [];
  const { data, error } = await admin.from('push_subscriptions').select('endpoint, keys').eq('user_id', userId);
  if (error) throw error;
  for (const r of data ?? []) rows.push({ endpoint: r.endpoint as string, subscription: { endpoint: r.endpoint as string, keys: r.keys as PushSubscription['keys'] } });
  let sent = 0;
  const failed: string[] = [];
  for (const row of rows) {
    try {
      await sendNotification(row.subscription, JSON.stringify(push), { TTL: 120, urgency: 'high' });
      sent += 1;
      await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('user_id', userId).eq('endpoint', row.endpoint);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      failed.push(String(status ?? (e as Error).message));
      // The phone no longer accepts this address: forget it.
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', row.endpoint);
      }
    }
  }
  return { sent, failed };
}
