# AGENTS.md: Chalk and Iron

This is the single briefing for any agent working on Chalk and Iron. The same file lives in the GitHub repository (`trantelica/chalk-and-iron`) and in the local project folder. Keep the two identical.

## Guiding rules

1. **Speak plainly.** Nathan is not a developer. Use everyday language and avoid engineer jargon. If a technical term is unavoidable, explain it in a few words.
2. **Follow the folder schema strictly** whenever you create folders or file anything on Nathan's MacBook. Read it first: `Project Context -N/Folder Schema -S/Folder Schema.md`. In short: find it in -N, trust it in -S, support it in -sub, sort uncertainty in -gov. The schema applies only to folders on Nathan's MacBook. It does not apply to the GitHub repository, which keeps its own code layout (`docs/`, `phase0/`, `prototype/`).
3. **When unsure where something goes on the MacBook, do not guess.** Put it in `00 FOLDER GOVERNANCE -gov` and tell Nathan.
4. **Ask before outward-facing or hard-to-undo actions** (deleting, publishing, sending, merging).
5. **Keep documents current.** Documents must be maintained and must not grow stale. When you change something, update every document that describes it in the same sitting, including both copies of this file (MacBook and GitHub). If you notice an out-of-date document, fix it or tell Nathan.
6. **No development before approval.** Nathan approves the technical design first (see below). Until then, write documents only, not app code. Nathan approved the technical design on 17 November 2026.

## Where to find things

| Need | Read |
|---|---|
| Folder and naming rules for local files | `Project Context -N/Folder Schema -S/Folder Schema.md` (local) |
| Project status and GitHub details | `Project Context -N/Project Overview -S/Project Overview.md` (local) |
| What to build, rules, edge cases | `docs/SPEC.md` (GitHub) |
| Look and feel reference | `prototype/index.html` (GitHub) |
| Connector test already run | `phase0/README.md`, `phase0/api/mcp.js` (GitHub) |
| Which model and effort level to use at each stage (standing instruction) | `docs/MODEL_AND_EFFORT.md` (GitHub) |
| How it will be built (approved 17 November 2026) | `docs/TECHNICAL_DESIGN.md` (GitHub) |
| Coach wording (parked draft) | `docs/COACH_INSTRUCTIONS.md` (GitHub) |
| Setting up the real app, and the sign-in proof | `docs/SETUP.md`, `proofs/connector-signin/README.md` (GitHub) |
| Starter library (version 2, 227 exercises, approved 17 November 2026) | `docs/STARTER_LIBRARY.md`, made from `data/starter-library.json` (GitHub) |

---

# Kickoff brief for the coding agent

You are building Chalk and Iron under Nathan's oversight. Nathan is the product owner and is not a developer. Explain choices in plain language and ask him when a product decision is missing. Do not guess at product behavior.

## Read first

1. `docs/SPEC.md`, all of it. Section 1 has eight rules the build must never break. Section 10 has the edge-case rules.
2. `prototype/index.html`. Open it in a browser. It is the reference for look, layout and interaction on the phone app and the planner. Where it disagrees with the spec, the spec wins.
3. `phase0/README.md` and `phase0/api/mcp.js`, the connector test that has already been run.

## What is already settled

- Phase 0 is done. On 16 November 2026 a ChatGPT Pro account read from and proposed to the test connector from the web, from an existing project, from the iPhone app and from a Dot agent. The connector over MCP is the coach path.
- The test connector had no sign-in. The real one needs it.
- Weights are stored in pounds.
- The technical design, `docs/TECHNICAL_DESIGN.md`, was approved by Nathan on 17 November 2026. Build from it and the spec together. Where they disagree, stop and ask Nathan.
- Section 9 of the spec lists the product decisions still open, each with a default to build.

## Your first deliverable: a technical design, before any app code (done, approved 17 November 2026)

Write `docs/TECHNICAL_DESIGN.md` and stop for Nathan's review. It must cover:

1. **Stack and hosting.** Nathan has Vercel and Supabase accounts. Recommend a stack, say why, and name what you considered and dismissed.
2. **Database schema.** Every table, field, type, relationship and constraint for the entities in Section 3, including how a session snapshots its plan and how per-day overrides attach to a workout item.
3. **Connector contracts.** For each tool in Section 4: inputs, outputs, errors, and the read-only or write annotation. Keep the tool names from the spec unless you give a reason to change one.
4. **Sign-in.** How app sign-in works, how the connector's sign-in works for ChatGPT and for Claude, and how one user's data is kept from another's.
5. **Lifecycles.** The states of a session, a proposal and a campaign, and what is allowed in each, following Section 10.
6. **Offline and sync.** What is stored on the phone, how sets logged offline are sent later, and what wins in a conflict.
7. **Timers and notifications.** How the clocks survive a closed app, and how a rest alert reaches a backgrounded iPhone web app.
8. **Theme tokens.** The token file format, with the three skins and seven accents from Section 6.
9. **Testing.** How each acceptance test in Section 8 will be automated, and which need a real device.
10. **Open questions.** Anything in the spec that is ambiguous or contradictory. List these, do not resolve them yourself.

## Working rules

- Work in phases as Section 7 sets out. Do not start a phase before the previous one is accepted.
- Every phase ends with its acceptance tests passing and a short plain-language summary for Nathan of what was built and what was not.
- Work on a branch and open a pull request for each phase. Do not push to `main` directly.
- No call to any LLM service from the app, ever. The coach is each user's own LLM, calling in through the connector.
- No hard-coded colors or fonts. Everything visual comes from theme tokens.
- No secrets in the repository.
- The `phase0/` folder is a throwaway. Reuse its ideas, not its code. Delete it once the real connector exists.

## Known open items to carry

- Whether the Coach button can open ChatGPT inside a specific project. Nathan wants this, so that project instructions apply to the coach chat.
- Whether Claude works as a coach through the same connector. Answered 17 November 2026 by the Phase 1 sign-in proof: yes, on the web, in a Project and in the iPhone app.
- Default work and rest seconds have no researched source yet.
- The coach instructions in `docs/COACH_INSTRUCTIONS.md` are a parked draft. Nathan will revise them after using the coach for real.
