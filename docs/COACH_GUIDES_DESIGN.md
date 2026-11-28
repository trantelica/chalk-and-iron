# Coach guides: design note (proposed, 27 November 2026)

Status: proposed by the agent (Opus 5.5, high) on 27 Nov 2026 at Nate's request, **waiting for Nate's approval**. Nothing here is built yet. When approved, it moves into `docs/TECHNICAL_DESIGN.md` Section 3 and this file is deleted.

## The problem, in Nate's words

The coach and its project instructions should "use an indexed model to point at context files … that explain procedurally how to handle different kinds of requests that we want to control in a certain way, such that we don't overwhelm the project instructions with excessive context on every interaction and dilute the effectiveness of any individual interaction or increase the probability of ignoring critical instructions or hallucination" (27 Nov).

What we saw in the client pass (`tests/coach-evals/results/2026-11-27-client-pass.md`): the coach instructions have grown to about 2,000 words. ChatGPT still skipped steps they ask for (questions before building, using the app for short requests). Nothing tells the coach *how to think* about designing a campaign or a workout: Nate asked that this have "some intention … specified somewhere somehow", from sources he can trust rather than his own expertise.

## The decision in short

1. **A short, always-on instruction block** (target: under 500 words): who the coach is, always use Chalk and Iron, read before proposing, ask before building, one card per request, nothing changes until the user accepts, the coach styles, "check setup", and one line saying "for each kind of request, read its guide first with `get_guide`".
2. **Guides fetched on demand** through a new read tool on the connector, `get_guide(topic)`. Each guide is a short playbook (target: under 600 words) for one kind of request: the steps to follow, the rules that matter for it, and the reasoning behind them.
3. **Pointers, not content, everywhere else.** Each tool's description names the guide to read first (for example `propose_campaign`: "Read get_guide('campaign_design') first"). `get_guide` with no topic returns the index: each topic, one line on when to use it, and its version.
4. **The guides live in the repository**, as Markdown files beside the connector code (`src/server/connector/guides/<topic>.md`), not in Supabase. They are the same for every user, so they need no database; in the repository every change goes through a pull request Nate can read, and they stay in step with the tools they describe. (Supabase would make sense only if each user later needed their own playbooks.)
5. **Enforcement: off to start, ready to switch on.** The design allows the server to refuse a campaign or workout card when that coach has not read the matching guide in the last 30 minutes (see "Optional enforcement"). It starts switched off; the next eval pass measures whether coaches read the guides, and Nate decides then.

## Why a tool, not MCP "resources"

MCP has a separate feature for documents ("resources"), but ChatGPT and the Claude apps do not reliably show resources to the model, while every coach app calls tools. A read-only tool works everywhere the connector already works. It reads no user data and writes nothing, so the coach lock is untouched, and the app still never calls an AI (rule 1): the server only answers.

## The guides (first set)

| Topic | Read before | What it covers |
|---|---|---|
| `ontology` | Any planning request | What an exercise, a workout and a campaign are; what is design and what is the run (Nate, 27 Nov: the Library holds the design, which workout on which day of which week, and the workouts' exercises and default sets and reps; Plan runs it, and this run's sets, reps, weights and rest are adjusted as it goes; a new run starts clean); off-plan and ad-hoc workouts; cards and what each kind changes |
| `campaign_design` | `propose_campaign` | How to design a campaign: sequence workouts across the week toward the user's priorities and days; how many weeks and why; progression across weeks and how the pace (steady, moderate, aggressive) maps to step sizes; lighter weeks; balance across movement patterns and muscle groups; weekly volume within sensible ranges for the user's experience; respect injuries, exercises to avoid and the gym's equipment and weights; reuse workouts before adding new ones |
| `workout_design` | `propose_workout` | How to build a workout: order (big compound lifts first), sets and reps by goal, rest, supersets (two or three, same sets), time budget against workout minutes, naming new exercises (equipment, variation, movement), the three alternates, no duplicates of library exercises |
| `today_change` | `propose_today_change` | In the gym: act at once without questions, change today only, never touch logged sets; what the user can already do themselves in the app (swap, reorder, skip) and when a card adds something they cannot |
| `weekly_checkin` | `get_weekly_summary` | The check-in: what to report, set against priorities; ask how a campaign went before proposing the next; after missed workouts ask what got in the way; the pace check |
| `intake` | An empty or partial profile | Running the intake as a short conversation; only the answers given; one profile card |
| `after_decline` | Any request touching a declined card | Read the reason; do not resend; when to raise it again and how to say why now is different; ask once if there is no reason |

The text of each guide follows the coach behaviour brief (`docs/SPEC.md` Section 4), which stays the source of truth for *what* the coach must do; the guides add *how*.

## Where the training principles come from

Nate does not need to be the expert, but the guides must say where their training principles come from. `campaign_design` and `workout_design` are drafted from published, widely used guidance, cited inside each guide, for example:

- American College of Sports Medicine, "Progression models in resistance training for healthy adults" (position stand, 2009);
- National Strength and Conditioning Association, *Essentials of Strength Training and Conditioning*;
- the U.S. Physical Activity Guidelines for Americans (2nd edition, 2018) for minimum weekly training.

The agent drafts the principles in plain words with their source beside each, marks anything that is the agent's own judgement as such, and Nate approves or changes them. They are defaults the coach applies unless the user's intake says otherwise ("how to coach me" still outranks them).

## How the coach is pointed to the guides

- **The instruction block:** "For each kind of request, call `get_guide` with its topic before acting. Call `get_guide` with no topic to see the list." The always-on rules stay in the block; procedures move out.
- **Tool descriptions:** each propose tool and `get_weekly_summary` names its guide; the description check (`tests/connector/descriptions.test.ts`) fails if a named guide does not exist.
- **Answers:** `get_guide` returns the guide's text, topic and version, and a reminder line to follow it. `get_profile` adds one line, "Guides: call get_guide with no topic for the list", so a coach that reads the profile first learns about them even if its app dropped the instructions.

## Optional enforcement (designed, off at first)

When switched on, `propose_campaign` and `propose_workout` check the call log for a `get_guide` call on their topic by the same coach app within the last 30 minutes. If there is none, the card is not added, and the coach gets a plain error: "Read get_guide('campaign_design') first, then send the card again." The call log already records each tool call; it would also record the guide's topic (no user content). A coach that follows its instructions never sees the error. Trade-off: one extra call per planning request, and a refusal if a coach app retries after half an hour. Nate decides after the next eval pass.

## Versions and "check setup"

Each guide carries a version. The instruction block's version (today 6) stays in the "check setup" line. When a guide changes, its version rises; when the block changes, Coach setup tells users to paste it again. Guides need no pasting: they are always fetched live.

## Tests

- Code checks: every topic named by a tool description or the block exists; each guide stays under its word limit; the block stays under 500 words; `get_guide` reads nothing from the database.
- Connector tests: `get_guide` with no topic returns the index; an unknown topic returns `not_found` with the list; the enforcement check (when on) refuses and then accepts.
- Coach evals: new scenarios checking that a coach reads the guide before a campaign or workout card (from the call log) and follows it (for example a lighter week in a campaign of five or six weeks), and a rerun of the core set with the shorter block.

## Building it

- **Model:** a new connector tool and its call-log change are connector work, Opus 5.5 high (`docs/MODEL_AND_EFFORT.md`, Phase 4). Drafting the guides' training content: Opus 5.5 high, with Nate's review.
- **Order:** (1) Nate approves this note; (2) the tool, the index, the pointers and the shorter block, with the guides first holding today's rules moved out of the block (no new advice yet); (3) the training principles drafted with sources, reviewed by Nate, added to `campaign_design` and `workout_design`; (4) an agent eval pass; (5) the Phase 4 review.
- **For Nate after the merge:** paste the shorter instruction block into the ChatGPT and Claude coach projects, and send "check setup".

## Questions for Nate

1. Approve the approach: a short block, guides fetched with `get_guide`, guides kept in the repository?
2. Enforcement off to start, decided after the next eval pass?
3. The sources above for the training principles, or others you trust?
4. Build it before the Phase 4 review (recommended, so the review checks the coach against the guides)?
