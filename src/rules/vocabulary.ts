// The vocabulary (spec Section 10, "Designs and history"): muscle groups,
// focus values and equipment. Renaming a value carries through to every
// exercise that uses it, because exercises hold the value's id. A value in use
// is archived, not deleted: exercises keep it, the pickers drop it, and it can
// be restored. Managed only in the browser planner.

/** How many exercises use each term. */
export function termUsage(exercises: { muscle_group_id: string | null; focus_id: string | null; equipment_id: string | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string | null) => { if (id) out.set(id, (out.get(id) ?? 0) + 1); };
  for (const e of exercises) { add(e.muscle_group_id); add(e.focus_id); add(e.equipment_id); }
  return out;
}

/** A term can be deleted only when nothing uses it, and for a muscle group, none of its focus values is used. */
export function canDeleteTerm(
  term: { id: string; kind: string },
  terms: { id: string; parent_id: string | null }[],
  usage: Map<string, number>,
): boolean {
  if ((usage.get(term.id) ?? 0) > 0) return false;
  if (term.kind === 'muscle_group') return terms.filter((t) => t.parent_id === term.id).every((t) => (usage.get(t.id) ?? 0) === 0);
  return true;
}

/** True when a name is already taken in the same list (the database keeps names unique, ignoring capitals). */
export function nameTaken(name: string, siblings: { id: string; name: string }[], selfId: string | null = null): boolean {
  const n = name.trim().toLowerCase();
  return siblings.some((s) => s.id !== selfId && s.name.trim().toLowerCase() === n);
}
