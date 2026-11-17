# Chalk and Iron

A weight-lifting tracker with three parts:

- a phone web app for logging workouts,
- a browser planner for building exercises, workouts and campaigns,
- a connector that lets each user's own ChatGPT or Claude project act as their coach.

Nothing is built yet. This repository holds the specification and a tappable prototype.

## What is here

| Path | What it is |
| --- | --- |
| `docs/SPEC.md` | The build specification: requirements, data model, coach connection, screens, theming, roadmap, acceptance tests and open decisions |
| `docs/COACH_INSTRUCTIONS.md` | Draft instructions a user pastes into their LLM project |
| `prototype/index.html` | A single-file prototype of the phone app and the browser planner, on sample data |

## Running the prototype

Open `prototype/index.html` in a browser. It needs no build step and no server. It loads fonts from Google Fonts, so it looks right only with a connection. Nothing is saved; a refresh resets it.

In the phone view, the settings button has a demo clock speed. Set it to 60× to watch the exercise dial drain and refill.

## For the coding agent

Read `docs/SPEC.md` in full before writing code. Section 1 lists eight rules the build must never break. Section 7 gives the order of work, and Phase 0 is a test that must run first. Section 8 is the acceptance test list. Section 9 lists open decisions with the default to build.

Where the prototype and the spec disagree, the spec wins.
