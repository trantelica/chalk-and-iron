// Resets the coach eval account ("Test Account") to one of the eval states
// in tests/coach-evals/states.mjs (design Section 9, "Coach behaviour evals").
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/coach-eval-reset.mjs standard
//
// Normally run by GitHub, not by hand: Actions > "Reset the coach eval
// account" > Run workflow, or `gh workflow run coach-eval-reset.yml -f state=standard`.
// The project's secret key lives only in GitHub's secret store (or in the
// environment of whoever runs this), never in the repository.
//
// The database does the reset in one step, and only on the account marked
// as the eval account (docs/SETUP.md), so this script cannot touch anyone
// else's data whatever it is asked to do.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildState, STATES } from '../tests/coach-evals/states.mjs';

const state = process.argv[2];
if (!state || !(state in STATES)) {
  console.error('Say which state. One of:\n' + Object.entries(STATES).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  process.exit(1);
}
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.');
  process.exit(1);
}

const starter = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'starter-library.json'), 'utf8'));
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.rpc('load_coach_eval_state', { p_starter: starter, p_state: buildState(state, { starter }) });
if (error) {
  console.error('The reset did not happen: ' + error.message);
  process.exit(1);
}
console.log(`The coach eval account is now in the state "${state}": ${STATES[state]}`);
console.log('Rows loaded: ' + JSON.stringify(data.rows));
