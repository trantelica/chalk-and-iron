# Next: Chalk and Iron

The current body of work, on one screen. Rewrite it as work moves and remove what is finished; the finished item gets a short entry in `docs/LOG.md`. Last updated 27 November 2026 (stage 4E built, awaiting Nate's yes to merge; next is stage 4F).

## Now

**Phase 3, the planner: accepted by Nate on 24 November 2026.** Phases 1, 2 and 3 are accepted. The live app is https://chalkandiron.vercel.app, built from `main`.

- **Phase 4, the coach, is starting** (`docs/SPEC.md` Section 7, item 5). Nate agreed how it divides by model on 24 November (`docs/MODEL_AND_EFFORT.md`, Phase 4).
- **The coach behaviour brief and the coach intake are approved** (24 Nov; `docs/SPEC.md` Section 4), with the coach behaviour evals (`docs/SPEC.md` Section 8, E1 to E19).
- **Stage 4A, data and the lock, is merged** (25 Nov): the coach intake fields, the decline reason, the weekly check-ins, the lock (a coach's pass can only read, add a pending card, record a check-in and note a call), and the reset of the coach eval account.
- **Stage 4B, connector core, is merged** (25 Nov): the real connector at https://chalkandiron.vercel.app/mcp with the proof's sign-in, the approval page, errors in one shape, size limits, too-many-requests, the one-minute repeat guard, the call log, the connector's instructions, and `get_profile`, `list_gyms` and `get_vocabulary`. `phase0/` and `proofs/connector-signin/` are deleted. Nate switched on the coach sign-in (step AJ) and ran the SQL step (AL) on 25 Nov; he connected ChatGPT and Claude to the real link (AK) the same day.
- **Stage 4C, the other read tools, is merged** (25 Nov): the other eleven read tools, with the weekly summary recording one check-in per week. **Its coach eval agent pass passed** (27 Nov): E9, E15, E16 and E18 on the live app, 4 of 4 (`tests/coach-evals/results/2026-11-27-agent-pass-4c.md`). Its Supabase test file runs and passes on GitHub.
- **Stage 4D, Accept and Decline, is merged** (27 Nov): one guarded step decides every coach's card. Accept applies all of it or none, for all five kinds: an exercise, a workout (with new exercises it brings), a campaign (a new one as a draft, or edits, or a shift; with new exercises and workouts), the profile and gyms, and a change to today, made inside a running workout without starting a new one, or in today's plan. Decline with its optional reason. Cards for today end at 3:00 am. A phone that was offline cannot overwrite an accepted change; it replays it. Nate ran its SQL step (AM) on 27 Nov. The inbox screens that use it come in stage 4F.
- **Stage 4E, the propose tools, is built** (27 Nov, Sonnet 5.5, medium; pull request open, not yet merged): `propose_exercise`, `propose_workout`, `propose_campaign`, `propose_today_change` and `propose_profile_update`, with every check, errors written to the coach, descriptions from the brief and the code check on them. Each card is stored in the shape stage 4D applies, and the tests accept every kind through the real Accept. **Still to do for 4E: its coach eval agent pass (E3, E4, E5, E17 and E19), which can run only on the live app after the merge.**
- **Next: stage 4F, the inbox (Sonnet 5.5, medium).** Phase 4 runs in eight stages, one pull request each: 4A data and the lock, 4B connector core, 4C the other read tools, 4D Accept and Decline, 4E propose tools, 4F the inbox, 4G Coach setup, Profile and gyms, 4H Home and the full eval, then the fresh review (`docs/TECHNICAL_DESIGN.md` Section 11).

## Waiting on Nate

- Nothing at the moment.

## Open items

- The coach eval account is Nate's Phase 1 test account, "Test Account" (Nate, 25 Nov). Nothing to make; each eval reset replaces its library, history, plans, cards, gyms and coach profile (`docs/SETUP.md` step AH, run by Nate on 25 Nov).
- Whether the Coach button can open ChatGPT inside a specific project, so that the project's instructions apply to the coach chat. Nate wants this.
- Default work and rest seconds have no researched source (`docs/SPEC.md` Section 9, rows 3 and 14).
- The coach instructions in `docs/COACH_INSTRUCTIONS.md` are a parked draft. Nate will revise them after using the coach for real.
- Whether a ChatGPT scheduled task can use the connector (for the weekly summary on a schedule). Not tested; Nate expects it to work.
- Open product decisions with a default to build: `docs/SPEC.md` Section 9.
- To confirm in Phase 4 (`docs/TECHNICAL_DESIGN.md` Section 10C): whether ChatGPT and the Claude app give their model the connector's own instructions (Claude Code does, and an agent session can attach for the eval agent pass: both confirmed 27 Nov).
- A coach's card and its targets are still added in two steps (4E tries the second step twice). A card with no targets would not be marked out of date when the user edits what it changes. One guarded database step would close this; it is database work (Opus 5.5, high) and needs one SQL step from Nate. Decision for Nate: before the first friend is invited, or never (`docs/TECHNICAL_DESIGN.md` Section 3, "How the propose tools are built").
- Plan against actual in the coach's tools: Nate said not yet (24 Nov). Listed in `docs/SPEC.md` Section 10, Later enhancements.

## Decided, not yet built

- **Phase 4:** the coach's cards join the inbox the planner's sent days already use (Nate, 20 Nov). A coach intake on Coach setup and Profile (coach style, experience, up to three priorities, pace, workout length, days, variety, likes, dislikes and anything else); the coach behaviour brief; weekly check-in marks on Home with a count in a row; an optional one-line reason when declining a coach's card, which the coach can read; a note on Home during a campaign's last week to ask the coach for the next one; and a weekly check-in set up as a scheduled task in the user's own LLM app (Nate, 24 Nov).
- **Phase 5:** cardio as a row inside a workout, with a heart symbol on cardio exercises (Nate, 19 Nov); a daily workout reminder at a time the user picks (Nate, 19 Nov); the skin and accent picker stays in Phase 5 with the Settings screen (Nate, 20 Nov).
- **Before the first friend is invited (Phase 6):** move Supabase to its paid plan or add a scheduled backup. Setup must tell users that a Focus mode can hold back rest alerts, and how to let Chalk and Iron through.
