# Next: Chalk and Iron

The current body of work, on one screen. Rewrite it as work moves and remove what is finished; the finished item gets a short entry in `docs/LOG.md`. Last updated 20 November 2026.

## Now

**Phase 3, the planner. Opening done; the planner screens are next.** Phases 1 and 2 are accepted. The live app is https://chalkandiron.vercel.app, built from `main`.

- **How the work divides** (agreed by Nate, 20 Nov; `docs/MODEL_AND_EFFORT.md`, "Phase 3"): the opening on Opus 5.5 at high effort; then the planner screens on Sonnet 5.5 at medium effort, in a new session; the review by a fresh Opus 5.5 high-effort session.
- **Opening (pull request 34):** the three workout fixes carried from the fresh check after the Phase 2 review (Undo break comes back even; a finished exercise opens again after a warm-up switch, with its clock; a warm-up never keeps a record badge) and the carried document points. Nate's iPhone check: `docs/SETUP.md` step S, after the merge. These fixes are checked by the fresh Opus 5.5 high-effort review, with the rest of Phase 3, unless Nate asks for a separate check.
- **Planner screens, on Sonnet 5.5 at medium effort** (`docs/SPEC.md` Section 7, screens in Section 5, rules in Section 10), in pieces, one pull request each: **(1) the Library and the Vocabulary screen, with the exercise panel: [pull request 35](https://github.com/trantelica/chalk-and-iron/pull/35), ready to merge once Nate says yes; his browser check is `docs/SETUP.md` step T**; (2) the Plan view with per-day overrides; (3) History with set editing; (4) sending a day to the phone with its inbox card, which needs a small database function (an Opus 5.5 high-effort helper, because it touches who may change a proposal).
- **Nate decided on 20 Nov:** logged sets can be edited or deleted in History, nothing else; the Vocabulary screen is built in Phase 3, in the planner only, never on the phone; a day sent when today already has a workout gets its inbox card in Phase 3, and Phase 4 adds the coach's cards to the same inbox.
- Carried: `docs/SETUP.md` step P item 4 (a swap to an exercise not in the library): the planner can now archive exercises, so it is item 8 of step T.

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
