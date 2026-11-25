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

1. **Opening session: Opus 5.5, high.** The items carried from the Phase 1 review (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10):
   - the two account fixes (a reset that stays shut after its link is opened, and the 14-day clean-up on real Supabase), because they are sign-in and access work;
   - the `assisted` and `load_count` fields, because they change the data model;
   - running the database and account tests against Supabase's own local version;
   - the throwaway iPhone test page for notifications, server-sent rest alerts and screen wake (removed 19 November 2026, once the real rest alert worked).
2. **Then Sonnet 5.5, medium,** for the screens and features: the active workout screen, the dial, the tray, supersets, typed and stepped entry, unit switching, records, stats, swap, breaking a superset into individual exercises, and the safe area.
3. **Hard spots to an Opus 5.5 high-effort helper** when the build reaches them: the rest timer and clocks that survive a closed app, and crash-safe sessions with sets logged offline and sent later.
4. **Review: a fresh Opus 5.5 high-effort session,** as for every phase.

## Phase 3: how the work divides (20 Nov 2026)

Agreed by Nate on 20 November 2026, on the same pattern as Phase 2.

1. **Opening session: Opus 5.5, high.** The three workout fixes carried from the fresh check after the Phase 2 review (Undo break leaving a superset uneven, a finished exercise's clock after a warm-up switch, a record badge left on a warm-up), because they touch the exercise clock and records worked out offline, which are hard spots. Also the document points carried with them.
2. **Then Sonnet 5.5, medium,** for the planner: the Library (exercises, workouts, campaigns), the Vocabulary screen, the Plan view with per-day overrides, the exercise panel, History, and sending a day to the phone with its inbox card.
3. **Hard spots to an Opus 5.5 high-effort helper** if the build reaches them, for example anything that changes the data model or per-user isolation (see "When work leaves its row").
4. **Review: a fresh Opus 5.5 high-effort session,** as for every phase.

## Phase 4: how the work divides (24 Nov 2026)

Agreed by Nate on 24 November 2026, on the same pattern as Phases 2 and 3.

1. **Opening session: Opus 5.5, high.**
   - The coach behaviour brief: questions to Nate with a recommendation each, then the brief for his approval, because it decides how every tool is worded.
   - The connector itself, with the sign-in carried from the Phase 1 proof (a hard spot).
   - The database rule that a coach pass can only add proposals, and the tests that one user's connector cannot read or propose against another's data.
   - Accept for every kind of proposal, all or nothing, with out of date and bundled exercises and workouts; a change to today applied inside a running workout.
   - The new fields (the three coaching preferences and the decline reason), because they change the data model.
2. **Then Sonnet 5.5, medium,** for the read tools, the propose tools' checks and errors, the tool descriptions written from the brief, the coach's cards in the inbox on both surfaces with the Coach button's count and the banner after Accept, the Proposals screen, Coach setup, Profile and gyms with the coaching preferences, the coach link and connected coach apps, the campaign's last-week note on Home, and deleting `phase0/`.
3. **Hard spots to an Opus 5.5 high-effort helper** if the build reaches them.
4. **Review: a fresh Opus 5.5 high-effort session,** as for every phase.

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
