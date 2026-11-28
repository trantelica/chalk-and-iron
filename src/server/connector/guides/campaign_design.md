---
topic: campaign_design
version: 2
when: Before propose_campaign. Planning a new campaign, or changing the days, overrides or dates of one.
---

# Designing a campaign

Read `ontology` first.

## Steps

1. Read `get_profile` (the whole intake), `list_gyms`, `get_campaign`, `list_workouts`, recent history and `list_proposals`.
2. If the running campaign ends within 7 days, ask how it went before proposing the next one.
3. Ask two or three short questions first (how the last block went, new aches, days available), fewer when the intake answers them, and wait.
4. When the user says "go ahead", send the card at once.

## Rules

- One to six weeks, Monday to Sunday. Each day gives its week, weekday (1 is Monday) and a workout or `"rest": true`.
- Reuse the user's workouts. Progression across weeks goes in per-day overrides, not near-identical workouts.
- Bundle every new exercise and new workout the campaign needs into this one card. Never send them as separate cards. New exercises follow `workout_design`.
- Supersets: two or three exercises, the same sets on every day.
- Respect injuries, exercises to avoid, the gym's equipment and its "Weights:" line. Base weights on recent history.
- Check every number in your summary against the card. One clear line per change. A new campaign arrives as a draft the user starts from Plan.

## Training principles

The user's intake (how to coach me, priorities, experience, pace, injuries, equipment and weights) outranks every default here. Sources: ACSM 2009 (American College of Sports Medicine, "Progression models in resistance training for healthy adults"), PAG 2018 (Physical Activity Guidelines for Americans, 2nd edition), NSCA (*Essentials of Strength Training and Conditioning*; cited from its standard teaching, not re-checked word for word). "Judgement" is the app's own default.

- **Every muscle, twice a week.** Train every major muscle group at least 2 days a week. (PAG 2018)
- **Days by experience.** New: 2 to 3 days a week; intermediate: 3 to 4; experienced: 4 to 5. The intake's days per week wins. (ACSM 2009)
- **Sequencing.** With 2 or 3 days, use full-body workouts; with 4 or more, a split (upper and lower, or push, pull and legs). Leave a day between two hard sessions for the same muscles. Give the first priority the most sessions, early in the week. (Judgement)
- **Weeks.** 4 to 6 for most; 1 to 3 for a trial or a return after a break. (Judgement)
- **Lighter week.** In a campaign of 5 or 6 weeks, make the last week lighter: same exercises and weights, about a third fewer sets. (Judgement; ACSM 2009 and NSCA vary load and volume over time)
- **When to step up.** When the user does one or two reps more than the target, raise the load 2 to 10% (ACSM 2009); NSCA's "2-for-2" waits for two extra reps on the last set in two sessions in a row.
- **Start from the progression pace.** Steady: one 5 lb step after every rep of every set is hit, hold after a miss, and drop one step after two misses at the same weight. Moderate: 5 lb for upper-body lifts and 10 lb for lower-body lifts when every rep is hit. Aggressive: up to 10 lb upper and 20 lb lower, never more than 10%, at every session whose reps are all hit. Round to the gym's weights. (Steady is the brief's rule; Moderate and Aggressive are judgement within ACSM 2009's range)
- **Balance.** Each week, about as many pulling as pushing sets, and both a squat and a hinge lift. (Judgement)
- **Weekly hard sets per muscle group.** New 4 to 8, intermediate 8 to 12, experienced 10 to 20; add sets only when the user recovers well. (Judgement; ACSM 2009 favours more sets as people progress)
- At a campaign's end, run the pace check (`weekly_checkin`) first.
