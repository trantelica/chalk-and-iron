# Coach evals, agent pass after stage 4E

- Date: 27 November 2026
- Coach app: Claude Code (desktop app), the Chalk and Iron connector attached as the session's own connection (19 tools, the five propose tools included), signed in to the eval account ("Test Account"), against the live app (production commit 16fd39a)
- Coach model: Sonnet 5.5, run by one Sonnet 5.5 session that played the coach and scored its own calls against the spec's Must and Must not (no separate helper per scenario, and no second scorer)
- Instructions given to the coach: `docs/COACH_INSTRUCTIONS.md` and the connector's own instructions and tool descriptions
- Scenarios: E3, E4, E5, E17, E19, each run once, with a reset to its state just before it (`gh workflow run coach-eval-reset.yml`). The two running states were used within two minutes of their reset.
- Where the scenario says the coach asks short questions first (E3, E19), the session answered them itself as the user. No card was accepted or declined; all five are left pending.

| Scenario | State | Result | Line |
|---|---|---|---|
| E3 New push workout | standard | Pass | Read the profile, gyms, workouts, vocabulary, past proposals, campaign, the chest, shoulder and triceps library and bench history first. Asked its questions (answered as: last push fine, no new aches, 60 minutes). One `propose_workout` (Push B, 16 sets) with one new exercise, Dumbbell Arnold Press: vocabulary values, all three alternates, work and rest seconds, name in equipment, variation, movement order. It used no exercise the library already has and stayed light on volume, since an earlier push proposal was declined for "too much volume". One stored card, pending. |
| E4 Bench is taken, workout running | workout_running | Pass | Read `get_today` (live Push A, no sets logged), then proposed at once, with no questions: one `propose_today_change`, swap Barbell Bench Press to Cable Seated Chest Press (picked because it needs no bench). Library and campaign untouched; sets and reps unchanged; card expires at the 3:00 am rollover. |
| E5 Cable station is taken, superset running | workout_running_superset | Pass | Read `get_today` (Cable Rope Pushdown and Cable Lateral Raise in superset A, one set each already logged). Proposed one `propose_today_change` with a single `break_superset` action. No change to sets, reps or weight; the logged sets stay as logged. |
| E17 Four exercises in one superset | standard | Pass | Sent the four as one superset exactly as asked. The app refused it with a plain message ("A superset holds two or three exercises. Split these into supersets of two or three, or make one a single exercise") and stored nothing. The coach then proposed a valid version: Overhead Press, Pushdown and Lateral Raise as one superset of three, Bench Press on its own at 4 sets, and said the limit of three in the card. It did not call the failed call done. |
| E19 Campaign with three new exercises and a new workout | standard | Pass | One `propose_campaign` (Strength Block 2, 4 weeks from 14 Dec, Tuesday legs, Friday push, Sunday new Pull B) that bundles three new exercises (Barbell Pendlay Row, Barbell Rack Pull, Barbell Landmine Row) and the new workout Pull B. Bench steps 195, 200, 205 lb by day overrides. One card; no separate exercise or workout cards. The current campaign ends 13 Dec, more than 7 days away, so the "how did it go" rule did not apply. |

## Errors the app returned (3), and whether the wording helped

1. **E17, five exercises in one superset:** helpful. It named the exact rule, said what to do, and the second call passed first time.
2. **E19, "Dumbbell Incline Curl" and then "Cable Kneeling Crunch" as new exercises:** both were already in the library. The error said the name was too close to an existing exercise, gave that exercise's id and said to use it or pick a clearly different name. Helpful: it let the coach reuse the first one in the workout. The cause was the coach: it had not read the biceps or core lists before picking a name (the library has 227). After a search for "Thrust" and "Landmine" it chose a name that was new.
3. No other errors. Every other propose call was accepted first time.

## Things worth knowing

- The coach was never asked about equipment (E4): it swapped to a cable exercise and said why, since the home gym's single bench might be the one taken. A user might read "the bench is taken" as the barbell station only; this is the coach's judgement, not a rule.
- The eval account is left in the `workout_running_superset` state with the E5 card pending. Reset it before the next pass. Today-cards expire at 3:00 am.
- The coach read the list of existing exercises only for the muscle groups it first planned to use. This is exactly why the duplicate check exists, and it worked twice.

Result: 5 of 5 pass. Nothing needs Nate's judgment, though he may want to look at the campaign card's wording in the app (E19) and at the swap choice in E4.
