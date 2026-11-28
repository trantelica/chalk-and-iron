---
topic: workout_design
version: 2
when: Before propose_workout, or before adding exercises with propose_exercise. Building a new workout or changing one.
---

# Designing a workout

For a one-day need (a taken machine, a short day), do not change the workout: use `today_change`.

## Steps

1. Read `get_profile` (intake, injuries, exercises to avoid, workout minutes), `list_gyms`, `list_workouts`, recent history for the lifts involved (`get_exercise_history`, `get_records`, `list_sessions`; `list_cardio` when cardio matters), and `list_proposals` (see `after_decline`).
2. Ask two or three short questions first (how the last block went, new aches, how long they have), fewer when the intake answers them, and wait.
3. When the user says "go ahead", send the card at once.

## The workout

- Each item names a library exercise, or one in `new_exercises` in this card, with sets, reps and an optional rest and superset letter. To change a workout, give `workout`; `items` is then the whole new list.
- A superset holds two or three exercises with the same number of sets; reps can differ.
- Respect injuries, exercises to avoid, the gym's equipment and its "Weights:" line. Base weights on recent history.
- Vary focus on purpose within a muscle group across the week, for example different triceps heads.

## New exercises

- Call `list_exercises` first and reuse the same movement; a duplicate or a name too close is refused. Use only `get_vocabulary` values.
- Name it equipment, then variation, then movement: "Cable Overhead Triceps Extension".
- Give three alternates (bodyweight, basic gym, full gym) that train the same muscle; work and rest seconds; a default unit matching the gym.
- Bundle every new exercise the workout needs into this card.

## Equipment

If you are not sure the user has a piece of equipment, ask. If they do, propose adding it to the gym (`intake`). If not, offer the exercise's alternate.

## The card

Check every number in your summary against the card. One clear line per change. Then say it is waiting in the app.

## Training principles

The user's intake (how to coach me, priorities, experience, injuries, equipment and weights) outranks every default here. Sources: ACSM 2009 (American College of Sports Medicine, "Progression models in resistance training for healthy adults"), NSCA (*Essentials of Strength Training and Conditioning*; cited from its standard teaching, not re-checked word for word). "Judgement" is the app's own default.

- **Order.** Big muscle groups and multi-joint lifts first, then smaller and single-joint lifts. (ACSM 2009; NSCA)
- **By priority:**
  - Build strength: new lifters 8 to 12 reps; experienced lifters may add heavier sets of 1 to 6 reps with 3 to 5 minutes' rest. (ACSM 2009)
  - Build muscle: mostly 6 to 12 reps, 1 to 2 minutes' rest, several sets per exercise. (ACSM 2009)
  - Endurance: light to moderate loads, more than 15 reps, under 90 seconds' rest. (ACSM 2009)
  - General fitness and Build the habit: 8 to 12 reps, 1 to 3 sets. (ACSM 2009's range for new lifters; using it for these priorities is judgement)
  - Lose fat: the sources set no lifting range for it; use the muscle ranges with shorter rest and supersets. (Judgement)
- **Time.** Each exercise takes about sets × (work seconds + rest seconds). Keep the total within the workout minutes: cut single-joint sets first, then pair exercises in supersets. (Judgement)
- **Supersets.** Pair exercises that do not work the same muscles, such as a push with a pull. (Judgement)
- **Starting weight.** A new exercise starts at a weight the user can lift for the top of the rep range with one or two reps to spare. (Judgement)
