// Supersets are paired and equal (decided 17 Nov, questions 10, 39 and 40):
// two or three members, each with the same number of sets. The database
// enforces the same rule; this copy gives friendly messages first.

export interface SupersetItem {
  sets: number;
  superset?: string | null;
}

export function supersetProblems(items: SupersetItem[]): string[] {
  const groups = new Map<string, number[]>();
  for (const it of items) {
    if (!it.superset) continue;
    const list = groups.get(it.superset) ?? [];
    list.push(it.sets);
    groups.set(it.superset, list);
  }
  const problems: string[] = [];
  for (const [letter, sets] of groups) {
    if (!/^[A-Z]$/.test(letter)) problems.push(`Superset "${letter}" must be a single capital letter.`);
    if (sets.length < 2 || sets.length > 3)
      problems.push(`Superset ${letter} has ${sets.length} exercise${sets.length === 1 ? '' : 's'}. A superset holds two or three.`);
    if (new Set(sets).size > 1)
      problems.push(`Superset ${letter} gives its exercises different set counts (${sets.join(', ')}). Every member needs the same number of sets.`);
  }
  return problems;
}
