# Next: Chalk and Iron

The current body of work, on one screen. Rewrite it as work moves and remove what is finished; the finished item gets a short entry in `docs/LOG.md`. Last updated 26 November 2026 (stage 4C merged; stage 4D built, awaiting Nate's SQL step and merge).

## Now

**Phase 3, the planner: accepted by Nate on 24 November 2026.** Phases 1, 2 and 3 are accepted. The live app is https://chalkandiron.vercel.app, built from `main`.

- **Phase 4, the coach, is starting** (`docs/SPEC.md` Section 7, item 5). Nate agreed how it divides by model on 24 November (`docs/MODEL_AND_EFFORT.md`, Phase 4).
- **The coach behaviour brief and the coach intake are approved** (24 Nov; `docs/SPEC.md` Section 4), with the coach behaviour evals (`docs/SPEC.md` Section 8, E1 to E19).
- **Stage 4A, data and the lock, is merged** (25 Nov): the coach intake fields, the decline reason, the weekly check-ins, the lock (a coach's pass can only read, add a pending card, record a check-in and note a call), and the reset of the coach eval account.
- **Stage 4B, connector core, is merged** (25 Nov): the real connector at https://chalkandiron.vercel.app/mcp with the proof's sign-in, the approval page, errors in one shape, size limits, too-many-requests, the one-minute repeat guard, the call log, the connector's instructions, and `get_profile`, `list_gyms` and `get_vocabulary`. `phase0/` and `proofs/connector-signin/` are deleted. Nate switched on the coach sign-in (step AJ) and ran the SQL step (AL) on 25 Nov; he connected ChatGPT and Claude to the real link (AK) the same day.
- **Stage 4C, the other read tools, is merged** (25 Nov): the other eleven read tools, with the weekly summary recording one check-in per week. Next for it: the agent pass on E9, E15, E16 and E18 on the live app (`docs/TECHNICAL_DESIGN.md` Section 9).
- **Stage 4D, Accept and Decline, is built and in a pull request** (26 Nov): one guarded step decides every coach's card. Accept applies all of it or none, for all five kinds: an exercise, a workout (with new exercises it brings), a campaign (a new one as a draft, or edits, or a shift; with new exercises and workouts), the profile and gyms, and a change to today, made inside a running workout without starting a new one, or in today's plan. Decline with its optional reason. Cards for today end at 3:00 am. A phone that was offline cannot overwrite an accepted change; it replays it. Nate's SQL step is AM in `docs/SETUP.md`, before the merge.
- **Next: stage 4E, the propose tools (Sonnet 5.5, medium)**, which store cards in the shape stage 4D applies (`docs/TECHNICAL_DESIGN.md` Section 3, "What each proposal carries"). Phase 4 runs in eight stages, one pull request each: 4A data and the lock, 4B connector core, 4C the other read tools, 4D Accept and Decline, 4E propose tools, 4F the inbox, 4G Coach setup, Profile and gyms, 4H Home and the full eval, then the fresh review (`docs/TECHNICAL_DESIGN.md` Section 11).

## Waiting on Nate

- **Step AM** (`docs/SETUP.md` Section 22): run the two SQL files for stage 4D in the Supabase SQL Editor, then say whether to merge.

## Open items

- The coach eval account is Nate's Phase 1 test account, "Test Account" (Nate, 25 Nov). Nothing to make; each eval reset replaces its library, history, plans, cards, gyms and coach profile (`docs/SETUP.md` step AH, run by Nate on 25 Nov).
- Whether the Coach button can open ChatGPT inside a specific project, so that the project's instructions apply to the coach chat. Nate wants this.
- Default work and rest seconds have no researched source (`docs/SPEC.md` Section 9, rows 3 and 14).
- The coach instructions in `docs/COACH_INSTRUCTIONS.md` are a parked draft. Nate will revise them after using the coach for real.
- Whether a ChatGPT scheduled task can use the connector (for the weekly summary on a schedule). Not tested; Nate expects it to work.
- Open product decisions with a default to build: `docs/SPEC.md` Section 9.
- To confirm in Phase 4 (`docs/TECHNICAL_DESIGN.md` Section 10C): whether ChatGPT and Claude give their model the connector's own instructions, and whether an agent session can attach to the connector for the eval agent pass.
- For stage 4E: store each card in the shape of `docs/TECHNICAL_DESIGN.md` Section 3, "What each proposal carries", with a target (and the version seen) for every existing exercise, workout, campaign, gym or coach profile it edits; Accept re-checks those versions.
- Stage 4D's own choices for Nate to confirm (`docs/TECHNICAL_DESIGN.md` Section 5, Proposal): a workout card's superset sets win over campaign-day set overrides; a campaign card changes only the days it lists; a change to today that no longer fits is out of date; removing an exercise with sets logged ends it with them.
- For stage 4E: a proposal and its targets are added in two steps; make them one database step if a half-added card matters (`docs/TECHNICAL_DESIGN.md` Section 3, "How the connector is built").
- Plan against actual in the coach's tools: Nate said not yet (24 Nov). Listed in `docs/SPEC.md` Section 10, Later enhancements.

## Decided, not yet built

- **Phase 4:** the coach's cards join the inbox the planner's sent days already use (Nate, 20 Nov). A coach intake on Coach setup and Profile (coach style, experience, up to three priorities, pace, workout length, days, variety, likes, dislikes and anything else); the coach behaviour brief; weekly check-in marks on Home with a count in a row; an optional one-line reason when declining a coach's card, which the coach can read; a note on Home during a campaign's last week to ask the coach for the next one; and a weekly check-in set up as a scheduled task in the user's own LLM app (Nate, 24 Nov).
- **Phase 5:** cardio as a row inside a workout, with a heart symbol on cardio exercises (Nate, 19 Nov); a daily workout reminder at a time the user picks (Nate, 19 Nov); the skin and accent picker stays in Phase 5 with the Settings screen (Nate, 20 Nov).
- **Before the first friend is invited (Phase 6):** move Supabase to its paid plan or add a scheduled backup. Setup must tell users that a Focus mode can hold back rest alerts, and how to let Chalk and Iron through.
