---
topic: ontology
version: 1
when: Any planning request. What an exercise, a workout and a campaign are, what the Library designs and Plan runs, off-plan workouts, and what each kind of card changes.
---

# What things are in Chalk and Iron

## The library

- **Exercise:** one movement, such as Incline Dumbbell Press, with its muscle group, focus and equipment (values from `get_vocabulary` only), default unit, work and rest seconds, and three alternates (bodyweight, basic gym, full gym).
- **Workout:** an ordered list of exercises, each with sets, reps, an optional rest that overrides the exercise's default, and an optional superset letter.
- **Superset:** two or three exercises done in alternation. Every member has the same number of sets; reps can differ.
- **Campaign:** one to six weeks in a row, Monday to Sunday. Each day holds a workout or is a rest day. Week 1 is the week holding its start date.

## The Library designs, Plan runs (Nate, 27 Nov 2026)

- The **Library holds the design**: a campaign's name, its number of weeks and which workout (or rest) goes on which day of which week. The workouts hold their exercises and default sets and reps.
- **Plan runs it.** The user starts a campaign from Plan with a start date (only one runs at a time, and starting one ends another), shifts it forward a week, undoes a shift or ends it.
- **This run's numbers are overrides.** For any day, an override changes a row's exercise, sets, reps, weight or rest for that day only. Overrides are this run's progression: the user, or a card they accept, adjusts them as the run goes.
- **A new run starts clean.** Running a finished campaign again clears its overrides and shifts, so it starts from the workouts' defaults.
- So put progression (more reps in a later week, a heavier weight) in per-day overrides, never in near-identical workouts. Change a workout's own defaults only when the workout itself should change.
- A new campaign the user accepts arrives as a draft. Tell them to start it from Plan.

## Sessions and off-plan workouts

- A **session** is one performed workout, with everything logged in it.
- Today's workout comes from the running campaign's day, with its overrides, or from a day sent to the phone from Plan.
- An **off-plan workout** is any other workout: the user picked a saved workout, or built an **ad-hoc workout** from library exercises as they went (its source reads `ad_hoc`).
- A day whose date passes with no session is missed. Nothing moves, and the missed workout stays available to start later (`get_today` lists it).

## Cards

You cannot change anything yourself. Every change is a card (a proposal) the user accepts or declines in the app, and Accept applies all of it or none.

| Tool | What its card changes |
|---|---|
| `propose_exercise` | One library exercise, new or edited |
| `propose_workout` | One workout, new or edited, with any new exercises it needs |
| `propose_campaign` | A new campaign (a draft), changes to a campaign's days and overrides, or a shift forward of one week; with any new exercises and workouts it needs |
| `propose_today_change` | Today's workout only, never the library, the campaign or a set already logged; it ends at the 3:00 am rollover |
| `propose_profile_update` | The coach profile and intake, and or one gym |

A card is pending, accepted, rejected (declined, perhaps with a reason), out of date (the user changed the same thing themselves) or expired. Check one with `get_proposal_status`. If it is out of date, read the data again before proposing anew.

Next, read the guide for the request: `get_guide` with no topic lists them.
