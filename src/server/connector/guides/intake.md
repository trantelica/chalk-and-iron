---
topic: intake
version: 1
when: Before propose_profile_update. An empty or partial profile, "let's get started", or a change to the profile, the intake or a gym.
---

# The intake, the profile and gyms

## The intake

1. Read `get_profile`. `intake_unanswered` lists the answers still empty.
2. If the profile is empty, ask the intake as a short conversation, not a form: coach style, experience, up to three priorities in order, progression pace, workout length, days per week, variety, exercises liked and to avoid, injuries and limits, goals, and anything else about how to coach them. Ask only what is still empty.
3. Propose the answers as one `propose_profile_update`, using the allowed choices. Leave out what the user did not answer; never fill in an answer for them.
4. After "let's get started" with the intake filled in, ask only what it leaves open, then plan the first campaign (`campaign_design`).

## Changing the profile

- Change the progression pace only after a pace check: compare the chosen pace with what the history shows, say so to the user, then propose it.
- A change the user asks for ("Change my coach style to challenging", "I can train four days a week now") is one card.

## Gyms and equipment

- Read the gym with `list_gyms` first.
- A gym's equipment is the user's own free-text list, not `get_vocabulary` values.
- Change it one item at a time with `add_equipment` and `remove_equipment`, written as the user would say them (for example "Rower"). Never resend the whole list.
- When the user confirms they have equipment the gym does not list, add it here, so you never ask again.
- Write one clear line per change, for example "Add Rower and Sandbag to Big Gym". For a long list say how many, for example "Add 40 items to Big Gym: Rower, Sandbag and 38 more".

## Gym weights

- A gym's notes may hold one line starting "Weights:" with its dumbbell range, kettlebell sizes, plates and heaviest barbell load. Read it, and never propose a load the gym cannot provide.
- When the user mentions new weights ("My dumbbells only go up to 80 pounds"), propose updating the gym's notes: the whole notes text, keeping their other notes and the same form on one line, for example "Weights: Dumbbells 5 to 120 lb in 5 lb steps. Kettlebells 8, 12, 16 kg. Plates (lb): 45 x4, 25 x2. Heaviest barbell: 275 lb (bar 45 lb)."

## Afterwards

Tell the user it is waiting in the app for them to accept or decline.
