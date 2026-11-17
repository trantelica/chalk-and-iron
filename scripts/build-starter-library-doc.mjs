// Remakes docs/STARTER_LIBRARY.md from data/starter-library.json, the copy the
// app actually uses. Run after any change to the data file:
//   node scripts/build-starter-library-doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const lib = JSON.parse(readFileSync(join(root, 'data', 'starter-library.json'), 'utf8'));
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');
const byEquip = {};
for (const e of lib.exercises) byEquip[e.equipment] = (byEquip[e.equipment] ?? 0) + 1;

const out = [];
out.push('# Starter library');
out.push('');
out.push(`Version ${lib.version} · ${lib.exercises.length} exercises · Status: **approved by Nathan, 17 November 2026**`);
out.push('');
out.push('Every new account starts with these exercises and the starter vocabulary. This page is made from `data/starter-library.json`, which is the copy the app actually uses, by `node scripts/build-starter-library-doc.mjs`. Do not edit this page by hand: change the data file and remake the page.');
out.push('');
out.push('## History');
out.push('');
out.push('- **Version 1** (17 November 2026): 42 exercises drafted by the coding agent in Phase 1.');
out.push('- **Version 2** (17 November 2026): an outside coach reviewed version 1, kept all 42, edited 19 of them (swaps, form notes, the leg press renamed "Plate-Loaded Machine Angled Leg Press", the barbell reverse curl filed under Biceps) and added 185. The coding agent then made 14 rest times consistent with the default rule; muscle groups and focus are as the coach set them. Nathan approved it for every account. Accounts made with version 1 are brought up to version 2 by `supabase/migrations/20261117000600_starter_library_v2.sql`.');
out.push('');
out.push('## How it is put together');
out.push('');
out.push('- Names follow the coach naming rule: equipment, then variation, then movement.');
out.push('- Units are pounds for weighted lifts and bodyweight (BW) for bodyweight ones.');
out.push('- Work is 45 seconds per set for every exercise. Rest is 120 seconds for multi-joint lifts and 90 for single-joint and core work, the spec\'s defaults (Section 9, row 3). These have no researched source yet (row 14).');
out.push('- Every exercise has three swaps: bodyweight (your own weight, may use a fixed bar or a stable bench), basic gym (dumbbells, bands, barbell, kettlebell) and full gym (machines and cables). Every swap is itself an exercise in this library, so the app links the two and a swap uses that exercise\'s own history.');
out.push(`- By equipment: ${Object.entries(byEquip).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
out.push('');
out.push('## Logging conventions from the coach');
out.push('');
out.push('These are in the exercises\' notes. How the app treats them in records and totals is a Phase 2 question, listed in `docs/TECHNICAL_DESIGN.md` Section 10E.');
out.push('');
out.push('- **Dumbbells:** log pounds per dumbbell, and reps per side for one-sided lifts.');
out.push('- **Assisted machines** (assisted dip, assisted pull-up): log the machine\'s assistance. More assistance makes the rep easier, so progress shows as the number going down.');
out.push('- **Sleds:** log the added plates, and count one fixed-distance trip as one rep.');
out.push('- **Bands:** log the band\'s nominal resistance if it has one, and use the same band and setup each time.');
out.push('');
out.push('## Exercises');
for (const g of lib.vocabulary.muscle_groups) {
  const rows = lib.exercises.filter((e) => e.muscle_group === g.name);
  if (!rows.length) continue;
  const order = [...g.focus, null];
  rows.sort((a, b) => order.indexOf(a.focus) - order.indexOf(b.focus));
  out.push('');
  out.push(`### ${g.name} (${rows.length})`);
  out.push('');
  out.push('| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const e of rows) {
    out.push(`| ${cell(e.name)} | ${cell(e.focus ?? '')} | ${cell(e.equipment)} | ${e.default_unit} | ${e.rest_seconds} | ${cell(e.alternates.bodyweight)} | ${cell(e.alternates.basic_gym)} | ${cell(e.alternates.full_gym)} | ${cell(e.note)} |`);
  }
}
out.push('');
out.push('## Vocabulary');
out.push('');
out.push('| Muscle group | Focus values |');
out.push('|---|---|');
for (const g of lib.vocabulary.muscle_groups) out.push(`| ${g.name} | ${g.focus.join(', ') || '(none)'} |`);
out.push('');
out.push(`Equipment: ${lib.vocabulary.equipment.join(', ')}.`);
out.push('');
writeFileSync(join(root, 'docs', 'STARTER_LIBRARY.md'), out.join('\n'));
console.log('Wrote docs/STARTER_LIBRARY.md');
