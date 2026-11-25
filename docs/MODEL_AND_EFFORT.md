# Model and effort guide

Which AI model and how much thinking effort to use at each stage of Chalk and Iron. This is a standing instruction: switch according to this table and tell Nate what you switched to and why, in plain language. Pause and ask only when the work leaves its row (see "When work leaves its row").

## The table

| Stage | Model | Effort | Why |
|---|---|---|---|
| Technical design | Fable 5.2 (16 Nov 2026 only), then Opus 5.5 | High or xhigh | Schema, sync and sign-in decisions are expensive to undo |
| Phase 1, foundation | Opus 5.5 | High | The data model and per-user isolation get built here |
| Phases 2 to 5, most features | Sonnet 5.5 | Medium | Screens and features against a settled design and a prototype |
| Hard spots in any phase | Opus 5.5 | High | Offline sync, timers that survive a closed app, connector sign-in |
| Reviewing each phase | Opus 5.5 | High | A fresh, stronger pass before Nate accepts the work |

## Phase 2: how the work divides (17 Nov 2026)

Phase 2 holds more Opus work than any other phase. The rules above already decide it; this writes the split down. Nate agreed it on 17 November 2026.

1. **Opus 5.5, high: stages 4A, 4B and 4D,** the hard spots and the data model.
   - 4A: the new fields and table (the coach intake, the decline reason, the weekly check-in marks), the database rule that a coach pass can only add proposals and record a check-in, and the tests that one user's coach cannot reach another's data.
   - 4B: the connector itself, with the sign-in carried from the Phase 1 proof.
   - 4D: Accept for every kind of proposal, all or nothing, with out of date and bundled exercises and workouts, and a change to today applied inside a running workout.
   - The coach behaviour brief, which decides how every tool is worded, was done in the planning session and approved by Nate on 24 Nov (`docs/SPEC.md` Section 4).
2. **Sonnet 5.5, medium: stages 4C, 4E, 4F, 4G and 4H,** the read tools, the propose tools' checks and errors, the tool descriptions written from the brief, the inbox on both surfaces, Coach setup with the intake, Profile and gyms, the coach link and connected coach apps, Home's last-week note and check-in marks, and the full eval.
3. **Hard spots to an Opus 5.5 high-effort helper** if the build reaches them.
4. **Coach behaviour evals, agent pass: Sonnet 5.5, medium,** acting as the coach, because it is close to the coaches people use. It records and scores each scenario; Nate reviews any failure. (`docs/TECHNICAL_DESIGN.md` Section 9.)
5. **Review: a fresh Opus 5.5 high-effort session,** as for every phase.

The stages and their order are in `docs/TECHNICAL_DESIGN.md` Section 11.

## The Fable 5.2 date rule

Fable 5.2 is used on **16 November 2026 only**. Any work that carries over into 17 November 2026 or later is done on **Opus 5.5**. Where this guide says Fable 5.2 on any later date, read it as Opus 5.5.

If the technical design is still in progress at midnight on 16 November:
1. Save the work so far to `docs/TECHNICAL_DESIGN.md` on its branch and commit it.
2. Add a short "where I stopped" note at the top of the file.
3. Continue in a new session on Opus 5.5 at high effort, starting from that file.

## How to run it

- **One session per stage.** Choose the model and effort when the session starts.
- **Check your own model at the start.** Every session confirms its own model and effort against the table at the start, and says so if it is wrong.
- **Choose a helper's model on purpose.** Any agent that starts another session, helper or subagent chooses its model and effort from the table explicitly (never by default inheritance) and tells Nate in one line what it chose and why.
- **Hard spots go to a helper.** Offline sync, timers that survive a closed app, and connector sign-in are handed to an Opus 5.5 high-effort helper with a short brief. It reports back, then the phase carries on. Tell Nate when this happens.
- **Reviews are fresh.** Each phase ends with a new Opus 5.5 high-effort session that did not do the building. It checks the pull request against the spec and acceptance tests and reports to Nate in plain language before he accepts the phase.
- **Review fixes are checked fresh too.** Fixes made after a phase's review are checked by a fresh Opus 5.5 high-effort session before Nate accepts the phase, unless Nate waives it.

## When work leaves its row

Stop and tell Nate, in plain terms, when:
- A Sonnet phase fails the same test twice in a row, or hits a design question the spec does not answer. Propose moving that piece to Opus 5.5.
- A Phase 2 to 5 task touches the data model or per-user isolation. That is Phase 1 kind of work and moves up to Opus 5.5.

## Keeping this current

If the table changes, update this file and the pointer in `AGENTS.md` in the same sitting.
