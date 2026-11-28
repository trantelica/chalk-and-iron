---
topic: campaign_design
version: 1
when: Before propose_campaign. Planning a new campaign, or changing the days, overrides or dates of one.
---

# Designing a campaign

Read `get_guide('ontology')` first if you have not: the Library holds a campaign's design, and Plan runs it.

## Steps

1. Read `get_profile` (the whole intake; the user's answers win over your defaults), `list_gyms` (equipment and the "Weights:" line), `get_campaign` (what is running, and the drafts), `list_workouts`, and recent history for the lifts involved (`get_exercise_history`, `get_records`, `list_sessions`; `list_cardio` when cardio matters).
2. Read `list_proposals`, so you do not propose what was declined (see `after_decline`).
3. If the running campaign ends within 7 days, ask how it went before proposing the next one.
4. Ask two or three short questions first (how the last block went, new aches, days available), fewer when the intake already answers them. Then wait for the answers.
5. When the user says "go ahead" (or the same in other words), send the card at once. Do not ask more questions or restate the plan.

## Rules

- A campaign is one to six weeks, and weeks run Monday to Sunday. Each day gives its week, its weekday (1 is Monday) and a workout or `"rest": true`.
- Reuse workouts the user already has before adding new ones.
- Progression across weeks goes in per-day overrides of sets, reps, weight and rest, such as more reps in a later week, never in near-identical workouts.
- Bundle every new exercise and new workout the campaign needs into this one card, so the user approves it once. Never send them as separate cards. New exercises follow `workout_design`.
- Keep each superset to two or three exercises with the same number of sets, on every day, overrides included.
- Respect injuries, exercises to avoid, the gym's equipment and its "Weights:" line: never plan a load the gym cannot provide.
- Vary focus on purpose within a muscle group across the week, for example different triceps heads.
- Base weights on recent history. Do not jump a load without a reason you can state.
- Start from the progression pace. Steady: one 5 lb step after every rep of every set is hit, hold after a miss, and drop one step after two misses at the same weight. Moderate and Aggressive take larger or more frequent steps, at your judgment.
- At a campaign's end, run the pace check in `weekly_checkin` before planning the next one.
- To change an existing campaign, give its `campaign_id`. To move it a week later, send only `"shift_forward_weeks": 1`.

## The card

- Check that every number in your summary (weeks, sets, reps, weights, totals) matches what the card contains.
- Write one clear line per change.
- Afterwards, tell the user it is waiting in the app. A new campaign arrives as a draft: they start it from Plan.

## Training principles

Not written yet. The principles for sequencing workouts across the week, the number of weeks, lighter weeks, balance and weekly volume will be added here, with their sources, once Nate has reviewed them.
