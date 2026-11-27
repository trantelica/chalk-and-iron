// A gym's equipment list (spec Section 4; design Section 2, gyms). Free text,
// not the equipment vocabulary: a gym can have things the vocabulary does not
// (decided 17 Nov, question 25). These rules keep a large list tidy: no blanks,
// no repeats (ignoring capitals), A to Z, and a pasted list is split into items.
//
// A "fully equipped" setting (assume everything except what is listed as not
// available) is deliberately not built (Nate, 27 Nov). If it comes, it is one
// more field on the gym beside this list, and the editor's list and filter
// stay as they are: the list then holds the exceptions.

export const ITEM_MAX = 60;
export const LIST_MAX = 500;

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

export function sortEquipment(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/** Blanks and repeats removed (the first spelling wins), kept A to Z. */
export function cleanEquipment(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = tidy(raw);
    if (!t || seen.has(key(t))) continue;
    seen.add(key(t));
    out.push(t);
  }
  return sortEquipment(out);
}

/** A pasted list: one item per line or separated by commas or semicolons; bullets and numbers at the start of a line are dropped. */
export function parsePasted(text: string): string[] {
  return text
    .split(/[\n\r;,]+/)
    .map((l) => tidy(l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '')))
    .filter(Boolean);
}

export type EquipmentCheck = { ok: true; list: string[] } | { ok: false; error: string };

export function checkEquipment(list: string[]): EquipmentCheck {
  const cleaned = cleanEquipment(list);
  const long = cleaned.find((s) => s.length > ITEM_MAX);
  if (long) return { ok: false, error: `"${long.slice(0, 30)}…" is longer than ${ITEM_MAX} characters. Shorten it.` };
  if (cleaned.length > LIST_MAX) return { ok: false, error: `A gym holds at most ${LIST_MAX} items.` };
  return { ok: true, list: cleaned };
}

/** What adding a pasted list would do, so it can be shown before it is added. */
export function previewAdd(current: string[], pasted: string[]): { fresh: string[]; already: string[] } {
  const have = new Set(current.map(key));
  const fresh: string[] = [];
  const already: string[] = [];
  const seen = new Set<string>();
  for (const p of pasted) {
    const k = key(p);
    if (seen.has(k)) continue;
    seen.add(k);
    (have.has(k) ? already : fresh).push(tidy(p));
  }
  return { fresh, already };
}

export function filterEquipment(list: string[], query: string): string[] {
  const q = key(query);
  return q ? list.filter((s) => key(s).includes(q)) : list;
}

export function renameEquipment(list: string[], from: string, to: string): string[] {
  return list.map((s) => (s === from ? to : s));
}

export function listToText(list: string[]): string {
  return list.join('\n');
}
