# Next: Chalk and Iron

The current body of work, on one screen. Rewrite it as work moves and remove what is finished; the finished item gets a short entry in `docs/LOG.md`. Last updated 20 November 2026.

## Now

**Phase 3, the planner. Not started.** Library for exercises, workouts and campaigns, the Plan view with per-day overrides, History, and sending a day to the phone (`docs/SPEC.md` Section 7, screens in Section 5, rules in Section 10). Phases 1 and 2 are accepted. The live app is https://chalkandiron.vercel.app, built from `main`. Model and effort: `docs/MODEL_AND_EFFORT.md` (Phases 2 to 5: Sonnet 5.5 at medium; hard spots and the phase review on Opus 5.5 at high).

Carried into Phase 3: `docs/SETUP.md` step P item 4 (a swap to an exercise not in the library) can only be checked on the iPhone once the planner can archive or rename exercises.

**Fix first in Phase 3: from the fresh check of the fixes after the Phase 2 review (20 Nov).** Nate accepted Phase 2 with these carried over. They are older than pull request 28, which changed the set details sheet, but the sheet can now cause them as well as the tap.
1. **Undo break can leave a superset uneven (medium).** Break a superset of A and B (3 rounds), switch A's set 1 to a warm-up (or use + Set), then tap Undo break: A comes back with 4 sets and B with 3, and the budget is worked out from A. If Warm-up is then chosen on B's set 1, A's warm-up is removed instead. Cause: `undoBreak` in `src/rules/session.ts` restores the blocks but not each exercise's sets.
2. **A finished exercise's clock stays stopped after a warm-up switch (low).** Switching a logged set of a finished exercise to a warm-up adds a set to do, but the exercise clock does not restart (`toggleSet` does not reopen a stopped block the way `addSetToBlock` does). The time spent on that set is not counted, so efficiency reads too high.
3. **A record badge can stay on a warm-up (low).** In a superset, when a logged record set becomes a warm-up, the partner's matching set keeps its record badge on the phone (with a tap, both keep it). The account clears it, and the phone takes the account's records once online, so it shows mainly offline.
4. **Documents.** Put back the rule "Do not start a phase before the previous one is accepted" (it was dropped from `AGENTS.md` in pull request 31), and "reuse phase0's ideas, not its code". Untick the two graph-drawing tests in `docs/SPEC.md` Section 8 (three bars of equal height) until a test or an iPhone check covers the drawing. Confirm with Nate the `docs/LOG.md` entry for pull request 30 (skin and accent picker stays in Phase 5; setup step O was run).

## Waiting on Nate

1. **Delete the throwaway sign-in proof projects,** now that their last check has passed: Supabase `chalk-iron-signin-proof` and Vercel `chalk-iron-signin-proof`. This frees a Supabase free-plan slot. Supabase: https://supabase.com/dashboard, open `chalk-iron-signin-proof`, then **Project Settings** > **General**, and **Delete project** at the bottom. Vercel: https://vercel.com, open `chalk-iron-signin-proof`, then **Settings**, and **Delete Project** at the bottom. Delete only these two, never `chalk-and-iron` or `chalkandiron`.

## Open items

- Whether the Coach button can open ChatGPT inside a specific project, so that the project's instructions apply to the coach chat. Nate wants this.
- Default work and rest seconds have no researched source (`docs/SPEC.md` Section 9, rows 3 and 14).
- The coach instructions in `docs/COACH_INSTRUCTIONS.md` are a parked draft. Nate will revise them after using the coach for real.
- Delete `phase0/` (the throwaway connector test) once the real connector exists (Phase 4). The sign-in proof, `proofs/connector-signin/`, is throwaway too.
- Whether a ChatGPT scheduled task can use the connector (for the weekly summary on a schedule). Not tested; Nate expects it to work.
- Open product decisions with a default to build: `docs/SPEC.md` Section 9.

## Decided, not yet built

- **Phase 5:** cardio as a row inside a workout, with a heart symbol on cardio exercises (Nate, 19 Nov); a daily workout reminder at a time the user picks (Nate, 19 Nov); the skin and accent picker stays in Phase 5 with the Settings screen (Nate, 20 Nov).
- **Before the first friend is invited (Phase 6):** move Supabase to its paid plan or add a scheduled backup. Setup must tell users that a Focus mode can hold back rest alerts, and how to let Chalk and Iron through.
