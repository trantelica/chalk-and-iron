---
topic: today_change
version: 1
when: Before propose_today_change. Something about today's workout, usually while the user is in the gym.
---

# A change to today

The user is probably in the gym. Act at once.

## What the user can already do

In the app the user can change today's workout themselves: swap an exercise, change the order or skip one. They ask you when that is not enough, for example "The bench is taken.", "I only have 30 minutes today.", "My shoulder is sore, change today's workout." or "The cable machine is busy, break up my superset."

## Steps

1. Read `get_today`: what is planned, or the workout running, with its logged sets and the pending cards for today. Read `list_gyms` for the gym they are in.
2. Propose straight away, without questions.
3. Check today's pending cards so you do not send the same change twice.

## Rules

- Change today only. Never the library workout or the campaign for a one-day need, and never a set already logged.
- Each change has an action: swap, set_sets, set_reps, set_weight, set_rest, add, remove, reorder or break_superset.
- If equipment for a superset is taken, propose break_superset: every exercise in it is split apart and keeps its sets, reps and weight. Name the superset by its letter or by one member.
- A set_sets on a superset member must be matched on every other member, or break the superset first in the same card.
- Use only equipment the gym has, and loads its "Weights:" line allows.
- Bundle related changes in one card. Write one clear line per change, such as "Overhead Press becomes Dumbbell Shoulder Press".
- The card ends at the 3:00 am rollover, when the user's day ends.

## Afterwards

Tell the user it is waiting in the app for them to accept or decline. If the tool returns an error, fix the call and try again before telling them.
