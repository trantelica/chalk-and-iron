import 'server-only';
import { sendNotification, setVapidDetails, type PushSubscription } from 'web-push';
import { adminClient } from './admin-client';

// Sends notifications to a person's phones with standard Web Push (design
// Section 1). The private key lives only in Vercel's settings.
// THROWAWAY for now: used by the iPhone test page (/app/lab) only.

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
  const { data, error } = await admin.from('lab_push_subscriptions').select('endpoint, subscription').eq('user_id', userId);
  if (error) throw error;
  let sent = 0;
  const failed: string[] = [];
  for (const row of data ?? []) {
    try {
      await sendNotification(row.subscription as PushSubscription, JSON.stringify(push), { TTL: 120, urgency: 'high' });
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      failed.push(String(status ?? (e as Error).message));
      // The phone no longer accepts this address: forget it.
      if (status === 404 || status === 410) await admin.from('lab_push_subscriptions').delete().eq('endpoint', row.endpoint);
    }
  }
  return { sent, failed };
}
