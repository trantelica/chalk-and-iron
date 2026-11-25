# Chalk and Iron

A weight-lifting tracker with three parts:

- a phone web app for logging workouts,
- a browser planner for building exercises, workouts and campaigns,
- a connector that lets each user's own ChatGPT or Claude project act as their coach.

The live app runs at https://chalkandiron.vercel.app, built from `main`. Status: see `docs/NEXT.md`.

## What is here

| Path | What it is |
| --- | --- |
| `docs/NEXT.md` | What is being worked on now, what waits on Nate, and open items |
| `docs/LOG.md` | What was done and decided, by date |
| `docs/SPEC.md` | The build specification: requirements, data model, coach connection, screens, theming, roadmap, acceptance tests and open decisions |
| `docs/TECHNICAL_DESIGN.md` | The technical design: stack, database, connector contracts, sign-in, offline, timers, theme tokens, testing and open questions. Approved by Nate on 17 November 2026 |
| `docs/MODEL_AND_EFFORT.md` | Which AI model and effort level to use at each stage |
| `docs/COACH_INSTRUCTIONS.md` | Draft instructions a user pastes into their LLM project |
| `docs/SETUP.md` | Steps for Nate: run the sign-in proof, then set up the real app |
| `docs/STARTER_LIBRARY.md` | The starter library (version 2, 227 exercises, approved) and vocabulary, made from the data file |
| `AGENTS.md` | The briefing for every agent: how to work with Nate, the rules and where to find things |
| `src/` | The app: pages, server code and the shared rules |
| `supabase/migrations/` | The database: tables, per-user rules, accounts and admin functions |
| `tokens/` | Theme tokens: skins, accents, backgrounds |
| `data/starter-library.json` | Starter vocabulary and exercises copied into each new account |
| `tests/` | Automated tests. Run with `npm test` |
| `tests/coach-evals/` | The coach behaviour eval scenarios and the eval account's starting states. `scripts/coach-eval-reset.mjs` (or the "Reset the coach eval account" workflow on GitHub) loads a state |
| `proofs/connector-signin/` | Throwaway sign-in proof for ChatGPT, Claude and passkeys |
| `phase0/` | The throwaway connector test, already run |
| `prototype/index.html` | A single-file prototype of the phone app and the browser planner, on sample data |

## Running the prototype

Open `prototype/index.html` in a browser. It needs no build step and no server. It loads fonts from Google Fonts, so it looks right only with a connection. Nothing is saved; a refresh resets it.

In the phone view, the settings button has a demo clock speed. Set it to 60× to watch the exercise dial drain and refill.

## For the coding agent

Start with `AGENTS.md`: how to work with Nate, the rules, and where to find things. Then `docs/NEXT.md` for what to work on.

## Running the tests

`npm install`, then `npm test`. These quick tests need no accounts: the database tests run on a local in-memory Postgres.

Two more sets run in GitHub's test runs on every pull request, against Supabase's own local version (they need Docker, which GitHub's machines have): `npm run test:supabase` for the account and saving tests, and `npm run test:browser` for the passkey steps and the offline and reopen checks in a test browser. See `.github/workflows/test.yml` for the order: `npx supabase start`, then `node scripts/supabase-test-env.mjs`, then the tests.
