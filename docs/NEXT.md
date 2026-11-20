# Next: Chalk and Iron

The current body of work, on one screen. Rewrite it as work moves and remove what is finished; the finished item gets a short entry in `docs/LOG.md`. Last updated 20 November 2026.

## Now

**Phase 3, the planner. Not started.** Library for exercises, workouts and campaigns, the Plan view with per-day overrides, History, and sending a day to the phone (`docs/SPEC.md` Section 7, screens in Section 5, rules in Section 10). Phases 1 and 2 are accepted. The live app is https://chalkandiron.vercel.app, built from `main`. Model and effort: `docs/MODEL_AND_EFFORT.md` (Phases 2 to 5: Sonnet 5.5 at medium; hard spots and the phase review on Opus 5.5 at high).

Carried into Phase 3: `docs/SETUP.md` step P item 4 (a swap to an exercise not in the library) can only be checked on the iPhone once the planner can archive or rename exercises.

## Waiting on Nate

1. **Did the coach pass renew itself the next day?** The 18 November check (a ChatGPT scheduled task asking the reconnected ChatGPT to call `get_profile` without signing in again) has no recorded result. It also shows whether scheduled tasks can use the connector. Record the result in `proofs/connector-signin/README.md` (check 16).
2. **Then delete the throwaway sign-in proof projects,** if not already done: Supabase `chalk-iron-signin-proof` and Vercel `chalk-iron-signin-proof`. This frees a Supabase free-plan slot.

## Open items

- Whether the Coach button can open ChatGPT inside a specific project, so that the project's instructions apply to the coach chat. Nate wants this.
- Default work and rest seconds have no researched source (`docs/SPEC.md` Section 9, rows 3 and 14).
- The coach instructions in `docs/COACH_INSTRUCTIONS.md` are a parked draft. Nate will revise them after using the coach for real.
- Delete `phase0/` (the throwaway connector test) once the real connector exists (Phase 4). The sign-in proof, `proofs/connector-signin/`, is throwaway too.
- Open product decisions with a default to build: `docs/SPEC.md` Section 9.

## Decided, not yet built

- **Phase 5:** cardio as a row inside a workout, with a heart symbol on cardio exercises (Nate, 19 Nov); a daily workout reminder at a time the user picks (Nate, 19 Nov); the skin and accent picker stays in Phase 5 with the Settings screen (Nate, 20 Nov).
- **Before the first friend is invited (Phase 6):** move Supabase to its paid plan or add a scheduled backup. Setup must tell users that a Focus mode can hold back rest alerts, and how to let Chalk and Iron through.
