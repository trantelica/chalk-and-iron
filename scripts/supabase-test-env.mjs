// Reads the addresses and test keys of Supabase's local version (started by
// `npx supabase start`) and writes them where the automated tests look for
// them. These are the local version's built-in test keys, not real secrets.
// Usage in GitHub's test runs: node scripts/supabase-test-env.mjs >> "$GITHUB_ENV"
import { execFileSync } from 'node:child_process';

const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
const s = JSON.parse(out.slice(out.indexOf('{')));
const pick = (...names) => names.map((n) => s[n]).find(Boolean) ?? '';
const env = {
  SUPABASE_TEST_URL: pick('API_URL'),
  SUPABASE_TEST_PUBLISHABLE_KEY: pick('PUBLISHABLE_KEY', 'ANON_KEY'),
  SUPABASE_TEST_SECRET_KEY: pick('SECRET_KEY', 'SERVICE_ROLE_KEY'),
  SUPABASE_TEST_DB_URL: pick('DB_URL'),
};
console.error('supabase status fields: ' + Object.keys(s).join(', '));
for (const [k, v] of Object.entries(env)) {
  if (!v) throw new Error('Missing ' + k + ' in supabase status');
  console.log(`${k}=${v}`);
}
