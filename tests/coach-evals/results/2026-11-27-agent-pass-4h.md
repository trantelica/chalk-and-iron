# Coach evals, agent pass after stage 4H

- Date: 27 November 2026
- Coach app: Claude Code (desktop app), the Chalk and Iron connector attached as the session's own connection (all 19 tools listed: 14 read, 5 propose), signed in to the eval account ("Test Account"), against the live app (production commit ea8349c, stage 4H merged)
- Coach model: Sonnet 5.5, run by one Sonnet 5.5 session that played the coach and scored its own calls against the spec's Must and Must not (no separate helper per scenario, and no second scorer)
- Instructions given to the coach: `docs/COACH_INSTRUCTIONS.md` (the stage 4H version) and the connector's own instructions and tool descriptions
- Scenarios: E1 to E17 and E19, each run once with a reset to its state just before it (`gh workflow run coach-eval-reset.yml`). E18 was not run (see below). The two running states were used within a minute of their reset.
- Where a scenario says the coach asks short questions first (E1, E3, E8, E19), the session answered them itself as the user. No card was accepted or declined; the account was reset to `standard` at the end, which clears them.

| Scenario | State | Result | Line |
|---|---|---|---|
| E1 Empty profile | empty_profile | Pass | Read the empty profile and gyms, asked the intake questions, then one `propose_profile_update` with only the answers given (supportive, intermediate, strength then muscle, steady, 60 min, 4 days, some variety), using the allowed values. |
| E2 Intake filled, no campaign | intake_no_campaign | Pass | Read profile, gyms, campaign, workouts, sessions and past proposals. Asked nothing the intake answers. One `propose_campaign`: 4 weeks from 30 Nov on the user's Tue, Fri and Sun, library workouts, moderate-pace weight steps. One card. |
| E3 New push workout | standard | Pass, with a slip | Read first, asked its short questions, one `propose_workout` (Push B) with one new exercise (Dumbbell Arnold Press): vocabulary values, three alternates, work and rest seconds, a name in equipment-variation-movement order; no exercise the library already has. **Slip:** a summary line said "14 sets" and the workout has 12. Lighter than Push A because an earlier push card was declined for too much volume. |
| E4 Bench is taken | workout_running | Pass | Read `get_today`, proposed at once with no questions: one `propose_today_change`, swap to Cable Seated Chest Press (no bench needed). Library and campaign untouched. |
| E5 Cable station taken, superset | workout_running_superset | Pass | One `propose_today_change` with a single `break_superset`. No change to sets, reps or weight. |
| E6 "Try again" after decline | standard | Pass, with a slip | Read the decline reason ("too much volume") and proposed a lighter Push A: one added exercise of 3 sets against 8 extra in the declined version. **Slip:** the card text said 7 extra sets; it was 8. |
| E7 Decline with no reason | declined_no_reason | Pass | Read the proposals and today, sent nothing, and asked once in the chat why the face pull was declined. |
| E8 Declined idea, new campaign | campaign_last_week | Pass | The campaign ends in 2 days, so the coach asked how it went first. Then one campaign card on the same days with moderate steps. It did not raise front squats (declined for wrist pain); the card says the back squat stays. |
| E9 Ordinary weekly check-in | standard | Pass | Summarised the week (3 of 3 done, 45,495 lb, no records, 96% efficiency, 4 check-ins in a row, a row), set against the priorities, two adjustments in the chat and one proposal (squat to 225 lb in week 5, all reps hit at 220). The first propose call was refused (a day listed overrides with no workout); the message named the fix and the second call passed. |
| E10 Campaign ends this week | campaign_last_week | Pass | Summarised the week and asked how the block went before anything else. No proposal. |
| E11 Two workouts missed | two_missed | Pass | Reported 1 of 3 done and the two missed days, asked what got in the way. No proposal, no extra volume. |
| E12 Steady, every rep hit | steady_all_hit | Pass | Bench 190 lb hit 4 x 6 last time; one `propose_today_change` setting bench to 195 lb (one 5 lb step). |
| E13 Aggressive, misses | aggressive_misses | Pass | Said in the chat that the pace is outrunning the results (squat, bench and deadlift reps falling 6, 5, 4, 3 within each lift's sets) and proposed Aggressive to Moderate as one `propose_profile_update`. |
| E14 Tone, Supportive then Challenging | style_supportive, style_challenging | For Nate | Both replies were short, plain and number-led. Supportive: a warm "Well done" on four records. Challenging: named the one rep short on the last squat set and said to own it before adding weight. Only Nate judges the tone. The wording is above and was given in the chat during the pass, not stored. |
| E15 Knee injury | knee_injury | Pass | Read the profile (left knee, back squat under avoid). One `propose_workout` (Legs B) of Romanian deadlift, leg extension, seated leg curl, hip thrust and calf raise, using only library exercises; no squats or lunges. |
| E16 Hotel gym | standard | Pass | Read both gyms and today. One `propose_today_change` swapping each exercise for dumbbell, bench or band versions, with no weight above 50 lb. |
| E17 Four in one superset | standard | Pass | Sent the four as asked; the app refused it with a plain message (a superset holds two or three) and stored nothing. The coach then proposed a valid version: Overhead Press with the Pushdown and Lateral Raise as a superset of three, Bench on its own. |
| E18 Connector disconnected | standard | **Not run** | Needs the connector switched off in the coach app, then on again. The session switch (`set_session_connector_enabled`) also changes Nate's default for new sessions and could leave this session without its tools, so the agent did not use it without Nate's yes. Needs a decision (below). |
| E19 Campaign, three new exercises and a workout | standard | Pass | One `propose_campaign` (Strength Block 2, 4 weeks from 14 Dec, the next one after the block ending 13 Dec) bundling three new exercises (Barbell Rack Pull, Barbell Pendlay Row, Dumbbell Meadows Row) and the new workout Pull B. One card, no separate cards. |

## Errors the app returned (3), and whether the wording helped

1. **E9, a campaign day with overrides and no workout:** helpful. It said exactly what was missing; the second call passed.
2. **E17, four exercises in one superset:** helpful, as designed. It named the rule and the fix.
3. None other. Every other propose call was accepted first time.

## Things worth knowing

- **Two summary lines had the wrong number** (E3 "14 sets" for 12; E6 "7 extra sets" for 8). Both are the coach's arithmetic, not the app's. Nothing in the app checks a card's wording against its contents. Worth a line in the coach instructions about counting only what is on the card, or leaving it to Nate to decide it is fine.
- **E18 was not run.** To run it Nate (or a session he approves) switches the Chalk and Iron connector off for one session, the coach is asked "What did I bench last week?", and it is switched back on. Alternatively, Nate can run E18 in ChatGPT as part of his client pass (step AV in `docs/SETUP.md`) by disconnecting the connector there.
- The coach asked its questions in the chat and the session answered them itself, so no scenario here measures how the questions read to a real user; Nate's client pass covers that.
- Both the E17 and E19 reset states were reused within about a minute; no running state expired.

Result: 18 of 19 scenarios run; 17 pass (two with a wording slip), E14 is left for Nate, and E18 is not run.
