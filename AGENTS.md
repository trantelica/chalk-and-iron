# AGENTS.md: Chalk and Iron

Briefing for every agent. One copy in the GitHub repository, one in Nate's project folder; keep them identical. Change this file only when a rule or a pointer changes. Never record progress here: that goes in `docs/NEXT.md` and `docs/LOG.md`.

## Working with Nate

- Nate is the product owner, not a developer. Speak plainly; explain any unavoidable technical term in a few words.
- Any step Nate must do gives the exact link, menu path and button.
- Merging: when a pull request is ready, say so plainly ("This is ready to merge" or "Not ready yet", and why), above all before asking Nate to test anything on his iPhone (the live app builds only from `main`). Nate says yes or no. On yes, the agent merges it on GitHub itself. Never merge without his yes; never ask him to click Merge.
- Ask before anything else hard to undo: deleting, publishing, sending.
- Product decisions are Nate's. Don't guess at behaviour: ask, with a recommendation.

## Before you start

1. Read `docs/NEXT.md` for what to work on.
2. Check `docs/MODEL_AND_EFFORT.md` for the right model and effort level for the stage. If you are the wrong one, say so before starting.
3. When you start another session, helper or subagent, choose its model and effort from that table on purpose (never by default inheritance), and tell Nate in one line what you chose and why.
4. Fixes made after a phase's review are checked by a fresh Opus 5.5 high-effort session before Nate accepts the phase, unless Nate waives it.

## Where to find things

| Need | Read |
|---|---|
| What to work on now, what waits on Nate, open items | `docs/NEXT.md` |
| What was done and decided, by date (only when history is needed) | `docs/LOG.md` |
| Which model and effort level for each stage (standing instruction) | `docs/MODEL_AND_EFFORT.md` |
| What to build: rules, phases, acceptance tests, edge cases | `docs/SPEC.md` (Section 1 has eight rules the build must never break) |
| How it is built (approved by Nate on 17 November 2026) | `docs/TECHNICAL_DESIGN.md` |
| Look and feel reference (where it disagrees with the spec, the spec wins) | `prototype/index.html` |
| Setting up the live app, and Nate's iPhone checks | `docs/SETUP.md` |
| Starter library (227 exercises) | `docs/STARTER_LIBRARY.md`, made from `data/starter-library.json` |
| Coach wording (parked draft) | `docs/COACH_INSTRUCTIONS.md` |
| Folder and naming rules (MacBook only) | `Project Context -N/Folder Schema -S/Folder Schema.md` |
| What the project is, GitHub and local-only details (MacBook only) | `Project Context -N/Project Overview -S/Project Overview.md` |

## Folder schema (MacBook only)

Follow the folder schema strictly for anything filed on Nate's MacBook; when unsure, put it in `00 FOLDER GOVERNANCE -gov` and tell Nate. It does not apply to the repository.

## Building rules

- Work in phases as `docs/SPEC.md` Section 7 sets out. Do not start a phase before the previous one is accepted.
- One branch and pull request per piece of work; never push to `main`.
- Build from the spec and the design together; where they disagree, ask Nate.
- No call to any AI service from the app. No hard-coded colors or fonts. No secrets in the repository.
- A phase ends with its acceptance tests passing and a plain summary for Nate.

## Keeping documents lean

- In the same pull request as any change, update the documents that describe it.
- At each merge: update `docs/NEXT.md` and add one short entry to `docs/LOG.md`.
- Status lives only in `docs/NEXT.md`. The spec, the design and the README point to it and don't repeat it.
