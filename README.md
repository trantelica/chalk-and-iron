# Chalk and Iron

A weight-lifting tracker with three parts:

- a phone web app for logging workouts,
- a browser planner for building exercises, workouts and campaigns,
- a connector that lets each user's own ChatGPT or Claude project act as their coach.

The app is not built yet. This repository holds the specification, a tappable prototype, and the connector test that proved the coach path.

## What is here

| Path | What it is |
| --- | --- |
| `docs/SPEC.md` | The build specification: requirements, data model, coach connection, screens, theming, roadmap, acceptance tests and open decisions |
| `docs/TECHNICAL_DESIGN.md` | The technical design: stack, database, connector contracts, sign-in, offline, timers, theme tokens, testing and open questions. Approved by Nathan on 17 November 2026 |
| `docs/MODEL_AND_EFFORT.md` | Which AI model and effort level to use at each stage |
| `docs/COACH_INSTRUCTIONS.md` | Draft instructions a user pastes into their LLM project |
| `AGENTS.md` | The kickoff brief for the coding agent |
| `phase0/` | The throwaway connector test, already run |
| `prototype/index.html` | A single-file prototype of the phone app and the browser planner, on sample data |

## Running the prototype

Open `prototype/index.html` in a browser. It needs no build step and no server. It loads fonts from Google Fonts, so it looks right only with a connection. Nothing is saved; a refresh resets it.

In the phone view, the settings button has a demo clock speed. Set it to 60× to watch the exercise dial drain and refill.

## For the coding agent

Start with `AGENTS.md`. It is the kickoff brief: what to read, what is settled, and the first deliverable, a technical design for review before any app code. That design is in `docs/TECHNICAL_DESIGN.md` and was approved by Nathan on 17 November 2026. Phase 1 is next.
