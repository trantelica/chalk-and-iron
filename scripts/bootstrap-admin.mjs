// Makes the single-use invite for the very first admin (Nathan). It works
// only while the app has no accounts at all. Run once, after the database
// is set up:
//
//   APP_URL=https://your-app.vercel.app NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/bootstrap-admin.mjs
//
// It prints the invite link. Open it on your iPhone in Safari.
import { createClient } from '@supabase/supabase-js';

const { APP_URL, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env;
if (!APP_URL || !url || !key) {
  console.error('Set APP_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.rpc('bootstrap_first_admin_invite', { p_label: 'First admin' });
if (error) {
  console.error('Could not make the invite: ' + error.message);
  process.exit(1);
}
console.log('Your admin invite (works once, for 7 days):\n' + APP_URL.replace(/\/+$/, '') + '/register#code=' + data);
