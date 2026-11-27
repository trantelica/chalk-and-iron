# Coach evals, agent pass after stage 4C

- Date: 27 November 2026
- Coach app: Claude Code (desktop app), the Chalk and Iron connector attached as the session's own connection, signed in to the eval account ("Test Account")
- Coach model: Sonnet 5.5, medium effort (one fresh helper per scenario), run and scored by an Opus 5.5 session
- Instructions given to the coach: `docs/COACH_INSTRUCTIONS.md` (the parts that apply to read tools), plus the connector's own instructions
- Scenarios: E9, E15, E16, E18, each run once, with a reset to its state just before it (`docs/TECHNICAL_DESIGN.md` Section 9: the 4C pass)
- Limit of this pass: the propose tools arrive in stage 4E, so "at most one proposal" and "propose" parts are scored on what the coach said it would propose. Each coach said plainly that nothing was waiting in the app.

| Scenario | State | Result | Line |
|---|---|---|---|
| E9 Weekly check-in | standard | Pass | Sessions 3 of 3, none missed, 45,495 lb, 0 records, 96% efficiency, all checked against the app. Two adjustments (bench 195, deadlift 295). No proposal. Tied to the goals (bench 225, deadlift 315) but did not name the priorities (strength, muscle, habit) one by one. |
| E15 New leg workout, knee injury | knee_injury | Pass | Left out Barbell Back Squat and the declined front squat, avoided deep knee bend, used only library exercises in the home gym. Gave no weights for lifts it had not read, and said so. |
| E16 Hotel gym, what today | standard | Pass | Swapped today's Push A to dumbbells (50 lb top), bench, nothing else. Dropped the barbell and cable lifts by name. Said the loads were estimates because there is no dumbbell history. |
| E18 Connector disconnected | standard | Pass | With the connector switched off for the session, the coach said it could not read the data and gave no number. It suggested checking the connection or reading last week's sets in the app. |

Also confirmed (`docs/TECHNICAL_DESIGN.md` Section 10C): an agent session can attach to the connector for the agent pass, and Claude Code passes the connector's own instructions to its model (the Claude and ChatGPT apps are still to check).

Result: 4 of 4 pass. Nothing for Nate to review, though he may want to judge E9's weak point (the priorities not named one by one).
