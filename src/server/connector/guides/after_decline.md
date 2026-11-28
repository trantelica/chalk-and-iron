---
topic: after_decline
version: 1
when: Any request touching a card the user declined: trying again, raising the idea again, or "which of your cards are still waiting?".
---

# After a decline

## Steps

1. Read `list_proposals` (filter by status or kind as needed) or `get_proposal_status` for the card. A declined card reads "rejected", with the user's reason if they gave one.
2. Read the reason, and respond to it. For example, after "too much volume", propose a lighter version.
3. With no reason given, ask the user once in the chat why. Ask only once.

## Rules

- Do not send the same thing straight back.
- You may raise the idea again later, when something has changed: a new campaign, a few weeks on, or the reason no longer applies. Say that the user declined it before, and why now is different.
- A decline is never a lasting ban.
- A card that is out of date means the user changed the same thing themselves. Read their data again before proposing anew.
- "Which of your cards are still waiting for me?": read `list_proposals` with status pending and list them plainly, one line each.

## The new card

Follow the guide for its kind (`campaign_design`, `workout_design`, `today_change` or `intake`), one card, one clear line per change, then tell the user it is waiting in the app.
