// Point the app's server code at Supabase's local version.
const need = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_PUBLISHABLE_KEY', 'SUPABASE_TEST_SECRET_KEY', 'SUPABASE_TEST_DB_URL'];
for (const n of need) if (!process.env[n]) throw new Error(`${n} is not set: run npx supabase start, then scripts/supabase-test-env.mjs`);
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_TEST_SECRET_KEY;
