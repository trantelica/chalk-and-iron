// Near-duplicate exercise names (spec Sections 2 and 4). The app warns when a
// new name is a near-duplicate, and refuses one from a coach.
//
// Two names count as near-duplicates when they hold the same words, ignoring
// capitals, punctuation, word order, a plural "s" and common short forms.
// So "Incline Dumbbell Press" matches "Dumbbell Incline Press" and
// "DB incline presses". Spelling distance is deliberately not used: it would
// wrongly match genuinely different lifts such as Hip Adduction and Hip Abduction.

const SHORT_FORMS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  bw: 'bodyweight',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  pushup: 'push up',
  pullup: 'pull up',
  chinup: 'chin up',
  situp: 'sit up',
  'selectorised': 'selectorized',
};

function singular(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('es') && /(ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** A name reduced to its sorted words, for comparison. */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(singular)
    .flatMap((w) => (SHORT_FORMS[w] ?? w).split(' '))
    .filter(Boolean);
  return words.sort().join(' ');
}

export function isNearDuplicate(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** The first existing name that the new one nearly duplicates, if any. */
export function findNearDuplicate(newName: string, existing: Iterable<string>): string | null {
  const key = nameKey(newName);
  for (const name of existing) if (nameKey(name) === key) return name;
  return null;
}
