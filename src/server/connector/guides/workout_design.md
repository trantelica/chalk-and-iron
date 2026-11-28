---
topic: workout_design
version: 1
when: Before propose_workout, or before adding exercises with propose_exercise. Building a new workout or changing one.
---

# Designing a workout

For a one-day need (a taken machine, a short day), do not change the workout: use `today_change`.

## Steps

1. Read `get_profile` (intake, injuries, exercises to avoid, workout minutes, "how to coach me"), `list_gyms` (equipment and the "Weights:" line), `list_workouts`, and recent history for the lifts involved (`get_exercise_history`, `get_records`, `list_sessions`).
2. Read `list_proposals`, so you do not resend what was declined (see `after_decline`).
3. Ask two or three short questions first (how the last block went, new aches, how long they have), fewer when the intake already answers them. Then wait for the answers.
4. When the user says "go ahead" (or the same in other words), send the card at once.

## The workout

- Each item names an exercise from the library, or one you bring in `new_exercises` in this same card, with sets, reps and an optional rest and superset letter.
- To change a workout, give `workout` (its id or exact name); `items` is then the whole new list.
- A superset holds two or three exercises, each with the same number of sets. Reps can differ.
- Respect injuries, exercises to avoid, the gym's equipment and its "Weights:" line: never propose a load the gym cannot provide.
- Base weights on recent history. Do not jump a load without a reason you can state.
- Vary focus on purpose within a muscle group across the week, for example different triceps heads.

## New exercises

- Call `list_exercises` first. Reuse an existing exercise when it is the same movement: one the library already has, or one too close in name, is refused.
- Call `get_vocabulary` and use only its values for muscle group, focus and equipment.
- Name a new exercise as equipment, then variation, then movement, for example "Cable Overhead Triceps Extension".
- Give every new exercise three alternates: one bodyweight, one for a basic gym, one for a fully equipped gym. Each trains the same muscle with a comparable movement.
- Set work seconds per set and rest seconds on every new exercise.
- Choose its default unit to match the gym's equipment, pounds or kilograms.
- Bundle every new exercise the workout needs into this card, so the user approves it once. Use `propose_exercise` on its own only for a single exercise.

## Equipment

The gym's list may be incomplete. If you are not sure the user has a piece of equipment, ask. If they do, propose adding it to the gym (see `intake`) so you never ask again. If they do not, offer the exercise's alternate and ask only about that swap.

## The card

- Check that every number in your summary (sets, reps, weights, totals) matches what the card contains.
- Write one clear line per change.
- Afterwards, tell the user it is waiting in the app for them to accept or decline.

## Training principles

Not written yet. The principles for exercise order, sets, reps and rest by goal, and fitting the workout minutes will be added here, with their sources, once Nate has reviewed them.
