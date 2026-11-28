# Coach evals, Nate's client pass

- Date: 27 November 2026 (evening, America/Denver)
- Coach apps: ChatGPT and Claude on Nate's devices, each with the Chalk and Iron connector signed in to the eval account ("Test Account"), against the live app (production after stage 4H)
- Run by: Nate, typing the script in `docs/SETUP.md` step AV; resets and scoring by the coordinating Opus 5.5 session, which checked every card on the account and the server's call log (Vercel runtime logs, one `MCP` line per call) to see whether the coach actually used the app
- Coach instructions: tests 1 to 4 (first run) ran without the coach instructions pasted into the ChatGPT and Claude projects; Nate pasted them before the rerun of test 4, and they were in place from then on
- Nate's own ChatGPT settings were left as they are (chat memory on, his personal preferences, which ask for no flattery), as a friend's would be
- Each test started from a reset to its state (`gh workflow run coach-eval-reset.yml`). Two earlier attempts made without a reset (tests 5 and 8) were discarded. No card was accepted or declined; the account was reset to `standard` at the end

| Test | Scenario | App | Result | Line |
|---|---|---|---|---|
| 1 | E1 Empty profile, "Let's get started" | ChatGPT | Pass | One profile card with only the answers given (supportive, intermediate, strength then muscle, steady, 4 days, 60 minutes, some variety); said it was waiting in the app. |
| 2 | E2 Intake filled, no campaign | ChatGPT | Pass | Read profile and history (quoted bench and deadlift correctly), asked only what was open (how the block went, aches, lifts to avoid), then one 4-week campaign card on the usual days. Note for Nate: it added reps but no weight across four weeks, cautious for a Moderate pace. |
| 3 | E2 again | Claude | Pass | Read more history, asked four questions (answered from the script), then one 6-week campaign card with weekly weight steps and a lighter week 6, no added volume. Misread the last block as ended early, but asked rather than assumed. The card carries a "repeat the weight after a missed rep" rule the app does not act on; Claude said so. |
| 4 | E3 New push workout | ChatGPT | Partial | First run (no instructions pasted, no "@"): never called Chalk and Iron, answered from general knowledge; nothing reached the app. With "@Chalk and Iron", and again with the instructions pasted and no "@": read everything and sent one Push B card (13 sets, library exercises only, respecting the "too much volume" decline). Both times it asked no questions before building, which the brief requires. The two runs were nearly word for word the same (ChatGPT's memory across chats). |
| 5 | E4 Bench is taken, workout running | ChatGPT | Fail without "@", pass with it | Without "@" (instructions pasted): no call to the app, gym advice only, no card. With "@Chalk and Iron": at once one today-only card swapping to Selectorized Machine Chest Press, no questions, nothing else changed. Nate: low priority, he would switch lifts himself in that moment. |
| 6 | E4 again | Claude | Pass | Used the app with no "@", read today and the gym, at once one today-only card moving bench to the end (not a swap); offered a floor press as a fallback. Counted as a pass: it acted for today straight away without questions. |
| 7 | E6 "Try again" after a decline | ChatGPT | Pass (with clearer words) | "Try again" alone in a new chat made ChatGPT retry test 5's swap (memory of the earlier chat). With "Try again with the push workout I declined yesterday" (no "@"): it read the reason, "too much volume", and sent one lighter card (13 sets against 21 declined; the sums on the card check out). |
| 8 | E10 Weekly check-in, campaign ending | ChatGPT | Pass | Correct summary of the last full week (3 of 3, 45,495 lb, 96%, no records, 4 in a row); asked how the block went before proposing anything; after the answer asked about recovery rather than sending a card. |
| 9 | E13 Pace Aggressive, repeated misses | ChatGPT | Pass after a nudge | Said the pace was outrunning the results with rep-completion figures, but sent the card only after one more question and "go ahead and propose it": one profile card, Aggressive to Moderate, hold weights until 90% of reps. Its summary used the unfinished current week and its first message contradicted itself ("0 recorded misses" with squat sets of 6, 5, 4, 3). |
| 10 | E14 Supportive | ChatGPT | Pass (Nate) | Nate: "supportive enough, not overly brief". Long despite "Short answers. Give me the numbers." |
| 11 | E14 Challenging | ChatGPT | Weak (Nate: not blocking) | Almost the same reply as test 10; not challenging. Nate's own no-flattery preference and ChatGPT's memory ("your recent feedback about muscular fatigue", from test 9's chat) likely damped it. |

## What this pass shows

1. **The app and connector work with real ChatGPT and Claude.** Every card that was sent was in the right shape, waiting, and the coaches said so.
2. **ChatGPT does not always reach for Chalk and Iron.** Without the coach instructions it coached from general knowledge; with them, longer requests used the app but a short in-the-moment one ("The bench is taken") did not, until "@Chalk and Iron" was added. Claude used the app every time.
3. **ChatGPT skips the questions before building** (tests 4 and 9) and tends to keep talking rather than proposing.
4. **ChatGPT's memory across chats** leaks earlier tests into new chats; real users' coaches will mix up conversations unless requests are specific.
5. **The user's own ChatGPT or Claude preferences shape the coach's tone** on top of the coach style.

## Fixes recommended (for the end-of-phase fixes)

- Strengthen the coach instructions with orchestration rules: always use Chalk and Iron for anything about training and never answer from general knowledge; read before proposing; before a new workout or campaign ask two or three short questions and wait; one card per request; check the card's numbers before sending; when the user says "go ahead", send the card; state each coach style plainly (Challenging: name what was missed and set the standard; Supportive: lead with what went well); keep to "how to coach me" (for example short answers).
- Coach setup: a "check setup" message whose fixed reply proves the instructions are in place; a note that ChatGPT users may need to name "@Chalk and Iron"; a note that personal ChatGPT or Claude settings also shape the coach's tone.
- Ask my coach messages: make each one specific, and for ChatGPT start with "@Chalk and Iron".
- Spec: E6's words become "Try again with the push workout I declined yesterday" (Nate, 27 Nov), since "Try again" alone in a new chat is not a realistic request.

Result: 11 tests run (13 runs). 6 pass (1, 2, 3, 6, 8, 10), 2 pass with a qualification (tests 7 and 9), 1 partial (test 4), 1 pass only with "@" (test 5, Nate: low priority), and 1 weak on tone (test 11, Nate: not blocking).
