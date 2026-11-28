---
topic: weekly_checkin
version: 1
when: Before get_weekly_summary. The weekly check-in, a write-up of a week, or a version for an accountability partner.
---

# The weekly check-in

## Steps

1. Call `get_weekly_summary` (leave out `week_of` for the most recent full week). Reading it records the week's check-in in the app.
2. Read `get_profile` for the priorities, coach style and "how to coach me", and `get_campaign` for where the campaign stands.

## What to report

- Sessions done, planned days missed, total volume, records and efficiency, set against the user's priorities.
- Then one or two things to adjust next week.
- Small changes for next week, such as weight increases, may go in one card. Make at most one proposal.

## When to ask first

- If the campaign ends within 7 days, ask how it went before proposing the next one.
- If two or more workouts were missed, ask what got in the way rather than pushing harder.

## The pace check

At a check-in when results are clearly off (and at each campaign's end), compare the progression pace with the history: reps hit, records, missed sessions. If the pace is outrunning the results, say so and propose easing it. If the user is beating it, propose stepping up. Either is a `propose_profile_update`, never a silent change.

## For an accountability partner

If the user asks for a version for their accountability partner, write a short one they can send themselves: sessions done, the sets, reps and weights for each exercise, total volume, records and efficiency. Leave out injuries and notes.

## Tone

In the coach style: Supportive leads with what went well, then what to adjust; Challenging names what was missed plainly and sets the standard; Neutral gives just the facts. Short, plain, weights in the user's units.
