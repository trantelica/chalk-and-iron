# Chalk and Iron

A weight-lifting tracker with three parts:

- a phone web app for logging workouts,
- a browser planner for building exercises, workouts and campaigns,
- a connector that lets each user's own ChatGPT or Claude project act as their coach.

Phase 1, the foundation, is built: the database with per-user isolation, passkey sign-in, invites and the admin page, theme tokens and the starter library. It runs at https://chalkandiron.vercel.app, built from the `phase-1-foundation` branch until Phase 1 is merged. See `docs/SETUP.md`.

## What is here

| Path | What it is |
| --- | --- |
| `docs/SPEC.md` | The build specification: requirements, data model, coach connection, screens, theming, roadmap, acceptance tests and open decisions |
| `docs/TECHNICAL_DESIGN.md` | The technical design: stack, database, connector contracts, sign-in, offline, timers, theme tokens, testing and open questions. Approved by Nathan on 17 November 2026 |
| `docs/MODEL_AND_EFFORT.md` | Which AI model and effort level to use at each stage |
| `docs/COACH_INSTRUCTIONS.md` | Draft instructions a user pastes into their LLM project |
| `docs/SETUP.md` | Steps for Nathan: run the sign-in proof, then set up the real app |
| `docs/STARTER_LIBRARY.md` | The starter library (version 2, 227 exercises, approved) and vocabulary, made from the data file |
| `AGENTS.md` | The kickoff brief for the coding agent |
| `src/` | The app: pages, server code and the shared rules |
| `supabase/migrations/` | The database: tables, per-user rules, accounts and admin functions |
| `tokens/` | Theme tokens: skins, accents, backgrounds |
| `data/starter-library.json` | Starter vocabulary and exercises copied into each new account |
| `tests/` | Automated tests. Run with `npm test` |
| `proofs/connector-signin/` | Throwaway sign-in proof for ChatGPT, Claude and passkeys |
| `phase0/` | The throwaway connector test, already run |
| `prototype/index.html` | A single-file prototype of the phone app and the browser planner, on sample data |

## Running the prototype

Open `prototype/index.html` in a browser. It needs no build step and no server. It loads fonts from Google Fonts, so it looks right only with a connection. Nothing is saved; a refresh resets it.

In the phone view, the settings button has a demo clock speed. Set it to 60× to watch the exercise dial drain and refill.

## For the coding agent

Start with `AGENTS.md`. It is the kickoff brief: what to read, what is settled, and the first deliverable, a technical design for review before any app code. That design is in `docs/TECHNICAL_DESIGN.md` and was approved by Nathan on 17 November 2026. Phase 1 is built and was reviewed on 17 November 2026 (design Section 10E, point 10). It awaits Nathan's acceptance.

## Running the tests

`npm install`, then `npm test`. The tests need no accounts: the database tests run on a local in-memory Postgres.
