# Next: Chalk and Iron

The current body of work, on one screen. Rewrite it as work moves and remove what is finished; the finished item gets a short entry in `docs/LOG.md`. Last updated 24 November 2026 (Phase 4 planned).

## Now

**Phase 3, the planner: accepted by Nate on 24 November 2026.** Phases 1, 2 and 3 are accepted. The live app is https://chalkandiron.vercel.app, built from `main`.

- **Phase 4, the coach, is starting** (`docs/SPEC.md` Section 7, item 5). Nate agreed how it divides by model on 24 November (`docs/MODEL_AND_EFFORT.md`, Phase 4).
- **First step: the coach behaviour brief** (Opus 5.5, high; `docs/SPEC.md` Section 4, "Coach behaviour"). Questions go to Nate with a recommendation each; his answers become the brief, which shapes the tool descriptions, error messages and setup page. Building the connector starts once he approves it.

## Waiting on Nate

1. **Answer the coach behaviour brief questions** (asked in the Phase 4 session).
2. **Delete the throwaway sign-in proof projects,** now that their last check has passed: Supabase `chalk-iron-signin-proof` and Vercel `chalk-iron-signin-proof`. This frees a Supabase free-plan slot. Supabase: https://supabase.com/dashboard, open `chalk-iron-signin-proof`, then **Project Settings** > **General**, and **Delete project** at the bottom. Vercel: https://vercel.com, open `chalk-iron-signin-proof`, then **Settings**, and **Delete Project** at the bottom. Delete only these two, never `chalk-and-iron` or `chalkandiron`.

## Open items

- Whether the Coach button can open ChatGPT inside a specific project, so that the project's instructions apply to the coach chat. Nate wants this.
- Default work and rest seconds have no researched source (`docs/SPEC.md` Section 9, rows 3 and 14).
- The coach instructions in `docs/COACH_INSTRUCTIONS.md` are a parked draft. Nate will revise them after using the coach for real.
- Delete `phase0/` (the throwaway connector test) once the real connector exists (Phase 4). The sign-in proof, `proofs/connector-signin/`, is throwaway too.
- Whether a ChatGPT scheduled task can use the connector (for the weekly summary on a schedule). Not tested; Nate expects it to work.
- Open product decisions with a default to build: `docs/SPEC.md` Section 9.

## Decided, not yet built

- **Phase 4:** the coach's cards join the inbox the planner's sent days already use (Nate, 20 Nov). Three coaching preferences on Profile (exercises I like, exercises to avoid, how I want my coach to work with me); an optional one-line reason when declining a coach's card, which the coach can read; a note on Home during a campaign's last week to ask the coach for the next one; and a weekly check-in set up as a scheduled task in the user's own LLM app (Nate, 24 Nov).
- **Phase 5:** cardio as a row inside a workout, with a heart symbol on cardio exercises (Nate, 19 Nov); a daily workout reminder at a time the user picks (Nate, 19 Nov); the skin and accent picker stays in Phase 5 with the Settings screen (Nate, 20 Nov).
- **Before the first friend is invited (Phase 6):** move Supabase to its paid plan or add a scheduled backup. Setup must tell users that a Focus mode can hold back rest alerts, and how to let Chalk and Iron through.
