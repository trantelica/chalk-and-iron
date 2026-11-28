// Running a campaign (Nate, 27 Nov 2026): the Library holds a campaign's
// design; Plan runs it. These are the plain words both screens use.

const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The plain status line under a campaign in the Library. `updatedAt` is when a finished campaign was last changed, which is when it ended. */
export function campaignStatusLine(c: { status: string; start_date: string; updated_at?: string }, timeZone: string): string {
  if (c.status === 'active') return `Running since ${pretty(c.start_date.slice(0, 10))}`;
  if (c.status === 'finished') {
    const ended = c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-CA', { timeZone }) : '';
    return ended ? `Finished on ${pretty(ended)}` : 'Finished';
  }
  return 'Draft';
}

/** The question asked before a campaign starts. A finished one starts a new run with no overrides from the last. */
export function startQuestion(name: string, startDate: string, endsOther: string | null, freshRun: boolean): string {
  return `Start "${name}" on ${pretty(startDate)}?${freshRun ? ' It runs again from the workouts\' own sets and reps: the last run\'s changes are not kept.' : ''}${endsOther ? ` "${endsOther}" is running now and will end.` : ''} Your past workouts stay in History.`;
}
