# Chalk and Iron: technical design

16 November 2026 · Written for Nathan's review · Status: **approved 17 November 2026** · Revised twice on 16 November after Nathan's answers to the decisions table, and twice on 17 November after his answers to Section 10

**Approved by Nathan on 17 November 2026.** Every row of the decisions table and every question in Section 10 is answered. The few details still marked "awaiting Nathan's confirmation" (questions 12, 14 and 39) and this design's own choices for question 41 stand as written unless Nathan changes them later. On approval Nathan also narrowed one rule: only a proposal that replaces today's workout with a different one splits a running session (Section 5). Phase 1 may now begin.

This is the plan for how Chalk and Iron gets built. It follows `docs/SPEC.md`. Where Nathan's answers change a product rule, the spec has been updated to match. Nathan approved it on 17 November 2026, so Phase 1 may begin.

Written by Fable 5.2 on 16 November 2026, as `docs/MODEL_AND_EFFORT.md` sets out. Any later revision is done on Opus 5.5 at high effort.

Both revisions of 17 November 2026 were done on Opus 5.5 at high effort. Section 10E, added during Phase 1 on 17 November 2026, records what the Phase 1 sign-in research found.

**How to read it.** Each section opens with a short plain-language summary. The tables underneath are the detail the coding agent builds from. Nathan does not need to check every field. The parts that need his attention are the summaries, the "Decisions for Nathan" list just below, and Section 10.

**A caution about facts.** Several choices here rest on how Supabase, iPhones, ChatGPT and Claude behave today. I wrote those parts from what I know, and did not open and check each product's current documentation in this sitting. Each such point is marked "to confirm" and collected in Section 10C, with a fallback. None of them should be treated as proven until a small test in Phase 1 says so.

## Decisions for Nathan

These are the choices in this design that cost money, add an account, or change something the spec says. Everything else is engineering detail.

| # | Decision | What this design proposes | Nathan's answer (16 Nov unless marked) |
|---|---|---|---|
| A | Stack and hosting | One web app on Vercel, with Supabase for the database and sign-in. This is the spec's starting suggestion. Section 1 | **Approved** |
| B | An email-sending service and a domain name | First draft: needed for sign-in emails and the weekly summary | **Changed.** The weekly summary is read by the coach through the connector and is not emailed. The emailed summary and the accountability partner are deferred to a later version. Invites are ready-to-paste text that the admin sends from their own email. That leaves sign-in as the only thing that might need email: see row H |
| C | Paid plans | First draft: paid Supabase plan before friends join | **Start on the free plan.** Nathan uses the app 4 to 6 times a week, so a pause is not a real risk. Backups were settled separately on 17 Nov (question 36): before friends join, move to the paid plan or add a scheduled backup |
| D | Sign-in on the iPhone home-screen app | An emailed link opens in Safari, which the iPhone treats as a different app from the home-screen app, so the link alone would not sign the app in. The email would carry a link **and** a six-digit code to type into the app. Section 4 | **Agreed**, as the fallback route. Row H makes passkey sign-in the first choice, which avoids the issue |
| E | Who can register | An invite link | **Decided.** Single-use invite links. Only an admin can make them, on an admin page. A person who was invited cannot invite others unless made an admin. Admins can create, delete, deactivate, reactivate and reset accounts. Section 4 |
| F | Rest alerts in the background | Sent by the server at the moment rest ends, using a scheduler inside Supabase. No third account. Section 7 | **Approved.** It is still confirmed on a real iPhone in Phase 1, as Section 10C lists |
| G | The open questions | Section 10 lists places where the spec is unclear or disagrees with itself. Each has a stated assumption so the build can proceed, but they are yours to settle | **Answered 17 Nov**, every question, and recorded in Section 10. Still awaiting your confirmation: small details of questions 12 and 14, the skip rule in question 39. Your request to break a superset is decided (question 41), with a few details that are this design's own choices |
| H | New: should the app send any email at all? | Sign-in is now the only reason for an email service. Two routes. **Email code:** the well-trodden route, self-service recovery, needs an email service and a domain. **Passkey only** (Face ID or Touch ID, no email): no email service, and the Safari problem in row D disappears, but recovery goes through the admin and it depends on facts not yet confirmed. Recommended: try passkey-only in the early sign-in proof (question 31, approved). Use it if it passes, fall back to email code if it does not. Section 4 | **Decided.** Passkey sign-in first, and the app sends no email. A lost sign-in is reset by an admin, who gets ready-to-paste reset instructions to send from their own email. If the passkey test fails, fall back to the emailed link and code, with a passkey still offered |

---

## 1. Stack and hosting

**In short:** one codebase, hosted on Vercel, holding the phone app, the planner and the connector. Supabase holds the data and handles sign-in. Two accounts Nathan already has. An email-sending service is added only if sign-in by emailed code is kept (Decisions, row H).

### Recommended

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for the phone app, planner, connector and rules. Catches a large class of mistakes before anything runs |
| Web framework | Next.js on Vercel | The most widely used pairing with Vercel and Supabase, so it is the best documented and the easiest for any future coding agent to pick up |
| Shape | One project with three doors: `/app` (phone), `/planner` (desktop), `/mcp` (connector) | One deployment, one set of rules, one place for sign-in. Nothing to keep in step |
| Database | Supabase Postgres | Nathan has the account. A real relational database suits this data, which is all relationships (campaign, day, workout, item, override) |
| Sign-in | Supabase Auth | Email sign-in is built in. To confirm: passkeys and the connector sign-in (Section 4) |
| Per-user isolation | Postgres row-level security | The database itself refuses to hand one user's rows to another. See Section 4 |
| Scheduled work | Supabase's built-in scheduler (pg_cron) | Rest alerts, session auto-finish, proposal expiry, account deletion. Keeps everything inside the two accounts |
| Email | Only if sign-in by emailed code is kept: Resend (suggested), connected to Supabase Auth | Supabase's own email sender is rate-limited and meant for testing only. Needs a domain name to send from. The app sends no other email: the weekly summary goes through the coach, and invites are pasted into the admin's own email |
| Notifications | Standard Web Push, sent from the server | The only route to a home-screen web app on iPhone |
| Storage on the phone | The browser's built-in database (IndexedDB), through the small Dexie library | Holds the active session and a queue of unsent changes. Section 6 |
| Connector | The official MCP software kit for TypeScript, running at `/mcp` | Same protocol Phase 0 proved. Reuses the ideas of `phase0/`, not its code |
| Shared rules | One module of pure functions: units, time budget, efficiency, records, day rollover | The same code runs on the phone (instant, offline) and on the server (authoritative). The acceptance tests in Section 8 of the spec test this module directly |
| Styling | Plain CSS driven by CSS variables generated from theme token files | Makes "no hard-coded colors or fonts" checkable by a machine. Section 8 |
| Fonts | Bundled with the app, not loaded from Google at run time | Works offline and makes no outside calls. All five fonts are open-licensed |

### Considered and dismissed

| Option | Why not |
|---|---|
| A native iPhone app now | Out of scope. The spec places it after the web version |
| A separate always-on server (for example on Fly or Render) | It would make timers easy, but it is a third thing to run, pay for and watch. The scheduler inside Supabase covers the need |
| Firebase | Not a relational database, and Nathan already has Supabase |
| SvelteKit or Remix in place of Next.js | Both would work. Next.js has the most guides and examples for Vercel with Supabase, which matters when an AI agent is the builder |
| A ready-made sync service (PowerSync, ElectricSQL, Replicache) | Powerful, but another service and another account. This app's offline need is narrow: one phone, one active session, a queue of sets. A small outbox does it (Section 6) |
| Supabase Edge Functions for the connector | A second runtime and a second place for code. Keeping the connector in the main app means one set of rules |
| Tailwind or a component library | They invite colors and sizes written straight into the page, which rule 7 forbids |
| A third-party sign-in company (WorkOS, Stytch, Clerk) | Kept as the fallback if Supabase cannot do the connector sign-in. Not the first choice because it is another account and splits sign-in across two places |

### Costs and accounts to expect

- Vercel: the free tier is likely enough to start.
- Supabase: start on the free tier (Nathan's decision, 16 Nov). It pauses only a project left idle, which regular use rules out. As I understand it the free tier keeps no automatic backups. Decided 17 Nov (question 36): before the first friend joins, either move to the paid plan or add a scheduled backup.
- Email service: only if sign-in by emailed code is kept. Usually free at this volume, and it needs a domain name, a small yearly cost.
- Web address: the app needs one permanent address either way. Vercel gives a free one. Decided 17 Nov (question 37): build and test on Vercel's free address, and choose the permanent address before the first friend is invited.
- No secrets go in the repository. Keys live in Vercel's and Supabase's own settings.

---

## 2. Database schema

**In short:** every record carries its owner, and the database enforces that only the owner can see it. Library records (exercises, workouts, campaigns) are separate from history records (sessions and sets). A session copies its plan when it starts, so later edits to the library can never rewrite the past.

### Rules that apply to every table

- `id`: a random unique id (uuid). The phone can create ids while offline, which is what makes "appears exactly once" possible (Section 6).
- `user_id`: the owner. Required on every table. Row-level security allows access only where `user_id` matches the signed-in user.
- `created_at`, `updated_at`: timestamps, stored in universal time.
- `version`: on library and profile tables, a counter that goes up by one on every edit. Used to spot out-of-date proposals (Section 5).
- Weights: always a pounds column (`…_lb`, up to 3 decimals, so 27.5 kg stores as 60.627). Where the user typed the value, the typed value and unit are stored beside it. A weight shown in the unit it was typed in shows exactly as typed. A converted weight shows to one decimal, so 60 lb shows as 27.2 kg (decided 17 Nov, question 2). If the user switches the entry box from lb to kg and logs the converted 27.2 kg without changing it, the set keeps the original 60 lb rather than 27.2 kg converted back, so a unit switch alone never changes a weight (confirmed by Nathan, 17 Nov). The same holds for a seeded weight (question 12): logged untouched, it keeps the exact pounds value it was seeded from, whatever unit the box shows.
- Bodyweight sets: a bodyweight set is recorded as a weight of 1 bodyweight unit ("1 BW") and a rep count. It has no pounds value (question 14).
- Nothing in the library is deleted. Exercises and workouts are archived with an `archived_at` date.
- Deleting an account removes every row that carries its `user_id`.

### Account and profile

**profiles** (the spec's User). One row per account.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Same id as the Supabase sign-in record |
| display_name | text | |
| totals_unit | 'lb' or 'kg' | Default 'lb' |
| time_zone | text | For example "America/Denver". Drives the 3:00 am day rollover |
| skin | 'chalk', 'arcade' or 'liquid' | Default 'chalk' |
| accent | text or empty | One of the seven accent names. Empty means the skin's own default |
| background | 'flat', 'steel' or 'board' | Used by the Chalk and Iron skin only |
| skins_available | list of text | The per-user gate from Section 6 of the spec. Default: all three |
| coach_link | text | The link the Coach button opens |
| is_admin | yes/no | Default no. An admin can open the admin page. It gives no access to anyone else's training data |
| account_status | 'active' or 'inactive' | An inactive account cannot sign in and its coach connection is refused. Its data is kept |
| setup_done | list of text | Which walkthrough steps are finished |
| delete_requested_at | timestamp or empty | Starts the 14-day grace period |

**coach_profiles**. One row per user: `goals`, `injuries_and_limits`, `weekly_schedule`, `notes` (all text), `version`.

**gyms**: `name`, `equipment` (list of text), `notes`, `is_default`, `archived_at`, `version`. The database allows only one default gym per user. The equipment list is free text, not picked from the equipment vocabulary, because gyms have things the vocabulary does not, such as a rower (decided 17 Nov, question 25).

**invites**. One row per single-use link, whether it invites a new person or resets an existing account's sign-in. Only an admin can create one.

| Field | Type | Notes |
|---|---|---|
| code_hash | text | The link's secret is stored scrambled, so reading the database does not reveal a usable link |
| purpose | 'invite' or 'reset' | |
| for_user | link or empty | The account a reset link belongs to |
| label | text | Who it is for, as the admin typed it |
| created_by | link to an admin | |
| expires_at | timestamp | Default 7 days after it is made |
| used_at, used_by | timestamp and link, or empty | Filled in the moment someone registers with it. A used link never works again |
| cancelled_at | timestamp or empty | |

The emailed weekly summary and the accountability partner are deferred, so they have no tables in this version.

**push_subscriptions**. One row per device that allowed notifications: `endpoint`, `keys`, `device_label`, `last_success_at`.

**vocabulary_terms**. One editable list per user, seeded from Section 4 of the spec.

| Field | Type | Notes |
|---|---|---|
| kind | 'muscle_group', 'focus' or 'equipment' | |
| name | text | Unique per user and kind, ignoring capitals |
| parent_id | link to a muscle group | Only for focus values |
| sort_order | number | |
| archived_at | timestamp or empty | A term in use is archived, never deleted |

Decided 17 Nov (question 26): exercises link to a term, so renaming it carries through to every exercise that uses it. Removing a term that is in use archives it: the exercises keep it, the pickers drop it, and it can be restored. The vocabulary is managed only in the browser planner. The phone shows terms but has no screen for editing them, to keep the phone uncluttered.

### Library

**exercises**

| Field | Type | Notes |
|---|---|---|
| name | text | Unique per user among live exercises, ignoring capitals. Renaming changes only this field, so all history stays attached |
| muscle_group_id | link to vocabulary | Required, except on an exercise made by a swap, where it may be empty (see below) |
| focus_id | link to vocabulary | Optional |
| equipment_id | link to vocabulary | Required, except on an exercise made by a swap, where it may be empty |
| default_unit | 'lb', 'kg' or 'bw' | 'bw' is bodyweight. A library field, changed only by a deliberate edit in the planner or by an accepted proposal. The phone's lb/kg switch does not change it (see `exercise_display_units`) |
| work_seconds | number, 5 to 600 | Default 45 |
| rest_seconds | number, 0 to 600 | Default 120 or 90 (decision 3 in the spec) |
| note | text | The persistent one-line note |
| created_via | 'starter', 'planner', 'swap' or 'proposal' | How the exercise joined the library. The database allows an empty muscle group or equipment only when this is 'swap' |
| archived_at, version | | |

**Exercises made by a swap** (decided 17 Nov, question 16). A swap to an alternate that is not yet in the library creates the new exercise at once, so the session never waits. The phone then shows a simple one-tap confirm of suggested details: muscle group, focus, work and rest seconds copied from the original; the unit is bodyweight for the bodyweight tier, otherwise the original's unit; equipment is suggested where it can be (bodyweight for the bodyweight tier, otherwise left for the user). If the user does not confirm, the exercise still joins the library with what is known from the original, and anything not known, usually equipment, stays empty. A swap-made exercise starts with no alternates, and that does not make it incomplete (confirmed by Nathan, 17 Nov).

An exercise is **incomplete** when its muscle group or equipment is empty. This is worked out, not stored. The planner shows an "Incomplete" flag on it and highlights the empty fields, and `list_exercises` tells the coach. The flag never blocks anything: an incomplete exercise can be logged, swapped to, put in workouts and used in campaigns like any other. A coach's proposed new exercise is never incomplete, because `propose_exercise` requires every field, and so does a new exercise bundled into a workout or campaign proposal.

**exercise_display_units** (decided 17 Nov, question 3). The phone's lb/kg switch for each exercise, kept apart from the library.

| Field | Type | Notes |
|---|---|---|
| exercise_id | link | One row per user and exercise |
| unit | 'lb' or 'kg' | The unit the phone last showed for this exercise |

- With no row, the phone uses the exercise's `default_unit`.
- If the default unit is later changed in the planner, the phone's remembered choice stays as it is (confirmed by Nathan, 17 Nov).
- A bodyweight exercise has no switch and no row.
- This is a remembered display choice, not a library edit. It has no `version`, does not raise the exercise's version, and never makes a proposal out of date.
- On the phone, the exercise's entry box, history, records and graph show in this unit. The planner has its own view toggle and does not use it. The connector reports weights in the exercise's `default_unit`, plus pounds.

**exercise_alternates**. Up to three rows per exercise, one for each tier. A new exercise proposed by a coach must have all three (decided 17 Nov, question 23), including one bundled into a workout or campaign proposal (question 22). One added by hand or made by a swap need not.

| Field | Type | Notes |
|---|---|---|
| exercise_id | link | |
| tier | 'bodyweight', 'basic_gym' or 'full_gym' | At most one of each per exercise |
| name | text | What the user or coach typed |
| alternate_exercise_id | link or empty | Filled in once that alternate exists in the library |

**workouts**: `name`, `archived_at`, `version`.

**workout_items**. The rows of a workout.

| Field | Type | Notes |
|---|---|---|
| workout_id | link | |
| position | number | Order in the workout |
| exercise_id | link | |
| sets | number, 1 to 12 | |
| reps | number, 1 to 50 | |
| rest_seconds | number or empty | Empty means use the exercise's rest |
| superset_letter | one letter or empty | Used by two or three items. Every item sharing a letter has the same `sets` (see below) |

**Supersets are paired and equal** (decided 17 Nov, questions 10, 11 and 39).
- A superset has two or three exercises (Nathan's rule, 17 Nov). A letter used by one item, or by four or more, is refused.
- Every member has the same number of sets. Reps can differ.
- The user's own changes keep members in step. In the planner, changing one member's sets changes them all, in a workout and in a day override. An exercise that joins a superset takes the superset's set count (confirmed by Nathan, 17 Nov).
- The same checks run on every save. A coach's proposal must give every member the same sets itself; one that does not is returned to the coach as an error (Section 3), so the card always shows exactly what will change.
- During a session they stay equal too. See `session_exercises` below. The one exception is a superset the user breaks apart during a workout (question 41): from then on, for that session only, its members are individual exercises and (this design's own choice) these rules no longer bind them.

Each item has its own permanent id. Day overrides attach to that id, not to "row 3", so reordering a workout never moves an override to the wrong exercise. This closes the prototype gap named in Section 5 of the spec.

**campaigns**

| Field | Type | Notes |
|---|---|---|
| name | text | |
| start_date | date | Any date. Weeks run Monday to Sunday, and week 1 is the week holding the start date (decided 17 Nov, question 19) |
| week_count | number, 1 to 6 | |
| status | 'draft', 'active' or 'finished' | The database allows only one active campaign per user. A new campaign from an accepted proposal starts as a draft (question 21) |
| version | | |

**campaign_shifts**. One row each time a campaign is pushed forward a week: `campaign_id`, `blank_week_starts_on` (the calendar week left empty), `made_by` ('user' or a proposal id). Days after the blank week fall one week later. Shifts do not count toward the six-week limit because they are stored apart from `week_count`.

**campaign_days**. One row per day that has a workout. A day with no row is a rest day.

| Field | Type | Notes |
|---|---|---|
| campaign_id | link | |
| week | number, 1 to 6 | Not above the campaign's week count |
| weekday | number, 1 to 7 | 1 is Monday. One row per campaign, week and weekday |
| workout_id | link | |

**campaign_day_overrides**. This is how a per-day override attaches to a workout item.

| Field | Type | Notes |
|---|---|---|
| campaign_day_id | link | Which day |
| workout_item_id | link | Which row of that day's workout. One override row per day and item |
| exercise_id | link or empty | Empty means "not overridden" for each field below |
| sets, reps | number or empty | |
| weight_lb, weight_entered_value, weight_entered_unit | or empty | |
| rest_seconds | number or empty | |

The database checks that the item belongs to the same workout the day uses, so an override can never point at a row from a different workout. Changing a day's workout removes that day's overrides, as the prototype does. In the planner, a sets override on one member of a superset is applied to every member of that superset on that day, so the day's superset stays even.

What a day actually plans is worked out when needed, never stored: the workout's current items, with that day's overrides on top. So an unperformed day always follows the current design, as Section 10 of the spec requires.

### History

**today_plans**. A prepared plan for one calendar day that is not the campaign's own. It exists for two cases: a day sent from the planner with "send to phone as today's workout", and a today-only proposal accepted before the session starts. Fields: `local_date`, `source` (campaign day or workout), `plan` (the full list of exercises as it should start), `made_by` ('user' or a proposal id). It is consumed when the session starts and never touches the library or the campaign.

**Sending a day from the planner** (decided 17 Nov, question 20). If today already has a workout, the sent day does not replace it straight away. It arrives in the inbox as a proposal with source 'planner': a card saying what would replace what, with Accept and Dismiss. Accept makes it today's workout, for today only, through `today_plans`. It changes neither the library nor the campaign. Dismiss changes nothing. If a session is already running when it is accepted, the existing rule for accepting a today proposal mid-session applies unchanged (Section 5). When today has no workout planned, a sent day becomes today's workout straight away, with no card (confirmed by Nathan, 17 Nov). After Accept, the campaign's own day for today is left as it was. If it is not done, it shows as Missed like any other day, and the user can remove it from the campaign if they do not mean to do it (accepted by Nathan, 17 Nov).

**sessions**

| Field | Type | Notes |
|---|---|---|
| local_date | date | The day it belongs to, using the 3:00 am rollover in the time zone at the start |
| source_kind | 'campaign_day' or 'ad_hoc' | |
| campaign_day_id, workout_id | links or empty | Where the plan came from |
| workout_name | text | Copied at the start |
| gym_id | link or empty | |
| started_at, ended_at | timestamps | |
| status | 'active' or 'finished' | The database allows only one active session per user (decided 17 Nov, question 30) |
| finish_reason | 'user', 'auto' or 'replaced' or empty | |
| clock_banked_seconds | number | Workout clock time already counted |
| clock_running_since | timestamp or empty | Set while the clock is running. See Section 7 |
| rest_ends_at, rest_total_seconds | or empty | The rest timer |
| current_session_exercise_id | link | Where the user is |
| last_activity_at | timestamp | Drives the 30-minute auto-finish |
| split_from_session_id | link or empty | Set when a mid-session proposal splits a session |

**session_blocks**. A block is one standalone exercise or one whole superset. It exists because a superset shares one exercise clock and one time budget.

| Field | Type | Notes |
|---|---|---|
| session_id | link | |
| position | number | Order in the session. Reordering in the tray changes this |
| superset_letter | letter or empty | |
| time_budget_seconds | number | Worked out by the shared rules and kept current when sets are added or removed. For a superset it is the spec's formula: rounds × the sum of each member's work seconds + (rounds − 1) × the first member's rest. A warm-up switch in a superset adds a whole round, so the budget grows by one round: each member's work seconds plus one rest |
| clock_started_at | timestamp or empty | Empty until Start exercise |
| clock_banked_seconds, clock_running_since | | The exercise clock, same method as the workout clock. Paused while the user is on a different block, and resumed on return (Section 7) |
| clock_stopped_at | timestamp or empty | Set when the last set is logged, or when the superset is broken apart |
| broken_at | timestamp or empty | Set when the user breaks this superset into individual exercises (question 41) |
| broken_from_block_id | link or empty | On a block made by a break: the superset block it came from |

**Breaking a superset** (decided 17 Nov, question 41). During a workout the user can break a superset into individual exercises, and each keeps its sets, reps and weight as defined. Every member is split apart, including in a superset of three. How the data handles it (the points marked "own choice" are this design's, not yet shown to Nathan):
- Each member moves to a new single block of its own. Own choice: the new blocks take the superset's place in the order, one after another, in member order. The new blocks have empty superset letters and point back through `broken_from_block_id`.
- Each new block's budget is the single-exercise formula on the sets that member still has to do: sets left × work seconds + (sets left − 1) × that member's own planned rest. Its clock is fresh and starts at Start exercise.
- If the superset was not started yet, nothing else happens: each member simply has all its sets in its own block, and the old block is left with no time and no sets, and is neither shown nor counted.
- Own choice: if the superset was started, the old block is closed at the break. Its clock stops and keeps the time it ran. Each member's `sets_before_break` records how many sets it had logged. For efficiency the old block counts like any started exercise: its time allocated is its budget × the sets logged before the break ÷ all the sets it planned. Sets left are not marked Skipped, because they move to the new blocks.
- Undo restores the superset as it was, with its clock resuming from its banked time, as long as no set has been logged since the break. After a set is logged, the break stays for that session. Own choice: any time on the new blocks' clocks is added back to the superset's clock on undo.

**session_exercises**. The snapshot of the plan at session start.

| Field | Type | Notes |
|---|---|---|
| session_id, block_id | links | |
| exercise_id | link | History follows this link, so a renamed exercise shows its new name |
| exercise_name_then | text | The name at the time, kept for the record |
| position_in_block | number | Order within a superset |
| planned_set_types | list | For example warm-up, working, working, working. Holds the warm-up switch on sets not yet logged. In a superset, all members' lists are always the same length and the warm-up switch changes the same round for every member |
| planned_reps | number | Also what the reps box is pre-filled with |
| planned_weight_lb, planned_weight_entered_value, planned_weight_entered_unit | or empty | Set by a day override or an accepted proposal. When set, it fills the weight box for every set in place of the seeded weight (assumption (b) below) |
| seed_weights_lb | list, one per set, or empty | The seeded weight for each set, worked out at session start (question 12, see below) |
| planned_rest_seconds, work_seconds | numbers | Copied at the start. The planned rest is the day override's, else the workout row's, else the exercise's |
| state | 'open', 'done', 'skipped' or 'replaced' | |
| origin | 'plan', 'added', 'swap' or 'proposal' | |
| swapped_from_exercise_id | link or empty | |
| sets_before_break | number or empty | Set when the superset this exercise was in is broken apart: how many of its sets were logged before the break (question 41) |

**The seeded weight** (decided 17 Nov, question 12). When the plan sets no weight, the weight box for set N is pre-filled with the weight of set N from the last session in which this exercise was done. If that session had no set N, it is pre-filled with the heaviest set from that session. Sets are counted in order, whatever their type. Tapping into the box clears it, ready for a new number. Logging without touching it commits the seeded value, keeping its exact pounds value. Still assumed, awaiting Nathan's confirmation: (a) "the heaviest previous set" means the heaviest set of that last session, not of today's; (b) a weight set by a campaign day override or an accepted proposal wins over the seed; (c) the very first time an exercise is done, the box is empty; (d) reps are pre-filled from the planned reps, as now. A bodyweight exercise has no weight box to seed: every set is 1 BW.

**set_logs**. One row per logged set.

| Field | Type | Notes |
|---|---|---|
| session_exercise_id | link | |
| set_number | number | |
| weight_lb | number, 3 decimals, or empty | Canonical. Empty for a bodyweight set, which has no pounds value |
| entered_value, entered_unit | number, 'lb', 'kg' or 'bw' | Exactly what was typed. A bodyweight set is always 1 and 'bw', shown as "1 BW" |
| reps | number, 1 or more | |
| set_type | 'warm_up', 'working' or 'drop' | Tapping a set row switches warm-up and working. In a superset that is a paired effect: the whole round switches for every member (question 39). A long press opens set details, where any of the three types and the RPE are set (decided 17 Nov, question 13). RPE is an effort rating: a 1 to 10 score for how hard a set felt |
| rpe | number 1 to 10 or empty | Optional |
| logged_at | timestamp | From the phone, at the moment of logging |
| record_types | list | Any of 'heaviest', '6_plus', '10_plus', '20_plus', 'most_reps' |
| deleted_at | timestamp or empty | A deleted set is kept as a marker so a late-arriving copy cannot bring it back |

Records are not a separate table. They are worked out from `set_logs` for an exercise, and worked out again whenever any set of that exercise is added, edited or deleted.

- **Ties** (decided 17 Nov, question 17). A record must strictly beat the best before that set, including earlier sets the same day. A tie is not a record and gets no celebration or badge. But when a set ties the best, the record moves to that most recent set: it shows that set's reps and date, so the weight, reps and date shown all come from one set (confirmed by Nathan, 17 Nov).
- **Estimated one-rep max** (decided 17 Nov, question 18): the highest estimate from any working or drop set, over all history.

**Volume.** Volume is weight × reps over working and drop sets. A bodyweight set counts as 1 BW, so its volume is 1 × reps, counted in BW units and kept apart from pounds totals (decided 17 Nov, question 14). For a bodyweight exercise, total reps plays the part that volume plays for a weighted one, everywhere: in the exercise's stats, in what the coach reads, and as the graph's volume line. Its graph bars are all the same height (1 BW), with the reps on top. Still assumed, awaiting Nathan's confirmation: a workout's summary shows bodyweight volume as its own figure beside the pounds total, for example "8,450 lb · 60 BW", rather than adding the two together.

**cardio_logs**: `local_date`, `type`, `duration_seconds`, `distance`, `distance_unit`, `notes`.

### Coach

**proposals**

| Field | Type | Notes |
|---|---|---|
| source | text | Which coach app sent it, for example "ChatGPT", or 'planner' for a day the user sent from their own planner when today already had a workout (question 20) |
| kind | 'exercise', 'workout', 'campaign', 'today_change' or 'profile_update' | A day sent from the planner is a 'today_change' |
| applies_to | 'today', 'library', 'campaign' or 'profile' | Shown on the card |
| summary_lines | list of text | What the user reads |
| payload | structured data | The exact changes, already validated. A workout proposal may carry new exercises, and a campaign proposal new exercises and new workouts, all in the same payload (question 22) |
| status | 'pending', 'accepted', 'rejected', 'out_of_date' or 'expired' | The five states, all visible to the coach (decided 17 Nov, question 4). See Section 5 |
| expires_at | timestamp or empty | Set for today proposals: the next 3:00 am day rollover in the user's time zone (decided 17 Nov, question 24) |
| created_at, decided_at | timestamps | |
| result | structured data or empty | What was created on Accept, including the ids of any bundled new exercises and workouts |

**proposal_targets**. One row per existing record a proposal would change: `proposal_id`, `record_kind`, `record_id`, `version_seen`. When the user edits a record, any pending proposal that targets it is marked out of date. The phone's lb/kg switch is not an edit to the exercise, so it never does this.

**connector_calls**. A short log of connector use: `client_name`, `tool`, `ok`, `called_at`. No content is stored. It powers the "connection test" on the Coach setup page and a "last used" line in settings.

### Housekeeping

- **admin_actions**: who did what to which account, and when. Written for every admin action. Holds no training data.
- **rest_alerts**: `session_id`, `fire_at`, `status`. See Section 7.
- **received_changes**: the ids of changes already received from phones, so a repeat is ignored. See Section 6.
- **starter library**: about 40 exercises with their three alternates and starter work and rest seconds, and the starter vocabulary, live as a data file in the repository and are copied into each new account at registration. Drafting the list is a Phase 1 build task, and Nathan reviews it (decided 17 Nov, question 28).

---

## 3. Connector contracts

**In short:** the sixteen tool names the spec started with are kept as they are, and three read tools are added: `get_weekly_summary` (Nathan's decision, 16 Nov), and `list_cardio` and `list_proposals` (17 Nov, question 29). Nineteen tools in all: fourteen read and five propose. A propose tool can do exactly one thing: add a pending proposal. The database, not only the code, enforces that.

### Rules shared by every tool

- **Sign-in.** Every call must carry a valid sign-in for one user (Section 4). Without one, the connector answers "not signed in" and the coach app starts the sign-in.
- **Whose data.** The user comes from the sign-in, never from anything the coach sends. No tool accepts a user id.
- **Weights.** Returned as the value in the exercise's default unit from the library (not the phone's display choice), the unit, and pounds: `{ "value": 27.5, "unit": "kg", "lb": 60.627 }`. Accepted as a value with a unit. A bodyweight set comes back as `{ "value": 1, "unit": "bw", "lb": null }`.
- **Volume.** Returned in the user's totals unit. Bodyweight volume is returned separately, in BW units, and never added to the pounds or kilograms figure.
- **Naming an exercise or workout.** A tool accepts either the id or the exact name.
- **Dates.** Calendar dates in the user's time zone, written `2026-11-16`.
- **Size.** List tools return at most 50 items unless noted, with a `next` marker for more.
- **Annotations.** Read tools: read-only yes, destructive no, repeat-safe yes, closed world. Propose tools: read-only no, destructive no, repeat-safe no, closed world. These are the same labels the Phase 0 test used when ChatGPT Pro was allowed to propose.

### Errors, in one shape

A failed call returns a plain sentence the coach can act on, a code, and where useful a list of problems.

| Code | Meaning | What comes back with it |
|---|---|---|
| not_signed_in | No valid sign-in | The coach app re-runs sign-in |
| not_found | The named exercise, workout, campaign, session or proposal does not exist for this user, and is not defined in the same proposal | What was asked for |
| invalid_input | A field is missing, the wrong type or out of range, or a superset would have fewer than two or more than three members, or members with different set counts | Each problem with the field name |
| unknown_vocabulary | A muscle group, focus or equipment value is not in the user's vocabulary | The allowed values |
| near_duplicate_name | A new exercise name is too close to an existing one | The existing exercise |
| nothing_to_change | No active campaign, or no workout today, for a tool that needs one | A sentence saying so |
| too_many_requests | Called too often | When to try again |
| server_problem | Something failed on the app's side | A sentence. No internal detail |

Validation errors are returned to the coach before anything reaches the inbox, as the spec requires.

### Read tools

| Tool | Inputs | Returns | Errors |
|---|---|---|---|
| get_profile | None | Display name, goals, injuries and limits, weekly schedule, notes, totals unit, time zone, today's date, default gym (id and name) | not_signed_in |
| list_gyms | None | Each gym: id, name, equipment list, notes, default flag | not_signed_in |
| get_vocabulary | None | Muscle groups, each with its focus values. Equipment values. Allowed units and set types | not_signed_in |
| list_exercises | Optional: `muscle_group`, `equipment`, `search`, `include_archived`, `next` | Each exercise with every field: id, name, muscle group, focus, equipment, default unit, work seconds, rest seconds, note, the alternates, archived flag, and an incomplete flag naming any empty fields (question 16) | invalid_input |
| get_exercise_history | `exercise` (required). Optional: `from`, `to` (default the last 12 weeks), `limit` (default 20 sessions, most 100) | The exercise and its unit. Per session: date, workout name, each set (number, weight, reps, type, RPE, records), session volume, Skipped mark. Estimated one-rep max | not_found, invalid_input |
| get_records | Optional: `exercise`. Without it, all exercises | Per exercise: the four records, each with weight, reps and date. For a bodyweight exercise, most reps. A tie moves the record to the newer set, so its reps and date are the latest | not_found |
| list_workouts | Optional: `include_archived` | Each workout: id, name, archived flag, items in order (item id, exercise, sets, reps, rest and whether it is the exercise default, superset letter, time budget) | invalid_input |
| get_campaign | Optional: `campaign_id`. Without it, the active campaign | Name, status, start date, week count, end date, any shifts. Each day: date, workout, state (upcoming, done, missed or rest), overrides per item. Also a short list of draft campaigns by id and name | not_found. No active campaign is not an error: it returns none, with a sentence |
| get_today | None | Today's date. What is planned, with overrides applied and last session's numbers per exercise. Any missed workouts still available. The live session if one is running: elapsed time, efficiency, volume, current exercise, each exercise's logged sets and Skipped or Replaced marks. Pending today proposals | not_signed_in |
| list_sessions | Optional: `from`, `to`, `limit` (default 20), `next` | Per session: id, date, workout name, source, gym, duration, volume, efficiency, records set, and each exercise with its sets and Skipped marks | invalid_input |
| get_proposal_status | `proposal_id` | Status (pending, accepted, rejected, out of date or expired), kind, created and decided times | not_found |
| list_proposals | Optional: `status` (any of the five), `kind`, `from`, `to`, `limit` (default 20, most 100), `next` | Newest first. Per proposal: id, source (which coach app, or the planner), kind, what it applies to, summary lines, status, created, decided and expiry times | invalid_input |
| list_cardio | Optional: `from`, `to` (default the last 12 weeks), `limit` (default 20, most 100), `next` | Newest first. Per entry: id, date, type, duration, distance and its unit, notes | invalid_input |
| get_weekly_summary | Optional: `week_of` (any date in the week wanted). Without it, the most recent full week | The week's dates. Sessions done and planned days missed. For each session: the exercises with sets, reps and weights. Total volume, records set, efficiency. Cardio entries for the week | invalid_input |

**The weekly summary goes through the coach.** The app cannot push anything to the user's LLM, because the app never calls an LLM (rule 1). So the summary is a read tool: the user asks their coach for the week, or sets their coach app to ask on a schedule, and the coach writes it up. For an accountability partner, the coach writes a version to share and the user sends it themselves. Whether a coach app's scheduled tasks can use a custom connector is not confirmed (Section 10C).

`get_campaign` gains one optional input the spec does not list, `campaign_id`, so a coach can read a draft it is asked to edit. With no input it behaves exactly as the spec describes.

`list_proposals` and `list_cardio` are read tools like the others: read-only yes, destructive no, repeat-safe yes, closed world. `list_proposals` lets a coach see what it proposed before and what the user decided, so it does not propose the same thing twice. `list_cardio` lets a coach see cardio outside the weekly summary.

### Propose tools

Every propose tool:

- requires `summary_lines`: 1 to 20 plain lines, each up to 300 characters, one per change;
- validates everything first and returns errors to the coach if anything fails;
- on success creates one pending proposal and nothing else;
- returns `proposal_id`, `status: "pending"`, what it applies to, an expiry time if it has one, and a sentence telling the coach to tell the user it is waiting in the app.

| Tool | Inputs besides summary_lines | Checks | Errors |
|---|---|---|---|
| propose_exercise | `exercise` (id or name) to edit one, or leave out for a new one. Fields: `name`, `muscle_group`, `focus`, `equipment`, `default_unit`, `work_seconds`, `rest_seconds`, `note`, `alternates` (bodyweight, basic gym, full gym). A new exercise needs all of them except focus and note, including all three alternates (decided 17 Nov, question 23) | Vocabulary values exist. Name is not a near-duplicate. Seconds are in range | not_found, invalid_input, unknown_vocabulary, near_duplicate_name |
| propose_workout | `workout` to edit, or leave out for new. `name`. `items` in order: `exercise`, `sets`, `reps`, optional `rest_seconds`, optional `superset` letter. Optional `new_exercises`: brand-new exercises with the same fields as `propose_exercise`, which the items can name (question 22) | Every exercise exists and is not archived, or is defined in `new_exercises`. Each new exercise passes every `propose_exercise` check, including the three alternates, and its name is not a near-duplicate of the library or of another new exercise in the proposal. Numbers in range. A superset letter is used by two or three rows, and every row sharing it has the same sets | not_found, invalid_input, unknown_vocabulary, near_duplicate_name |
| propose_campaign | `campaign_id` to edit, or leave out for new. `name`, `start_date`, `week_count`. `days`: week, weekday (1 is Monday), a workout or rest, and optional overrides per item (exercise, sets, reps, weight, rest). Or `shift_forward_weeks: 1` on its own. Optional `new_exercises` and `new_workouts` (each shaped as in `propose_workout`), which days and overrides can name (question 22) | 1 to 6 weeks. Every workout and exercise exists, or is defined in the same proposal. Bundled new exercises and workouts pass the same checks as in `propose_exercise` and `propose_workout`. Each override names an item of that day's workout. No day's overrides give superset members different set counts | not_found, invalid_input, unknown_vocabulary, near_duplicate_name |
| propose_today_change | `changes`, each with an `action` (swap, set_sets, set_reps, set_weight, set_rest, add, remove, reorder, break_superset), the exercise it applies to, and the new value. `break_superset` names the superset by its letter, or by any one of its members, and needs no value (question 41) | There is a workout today or a live session. Exercises exist in the library. It does not touch a set already logged. A `set_sets` on a superset member must be matched by the same `set_sets` on every other member, unless the same proposal breaks that superset first. `break_superset` names a superset that exists today and is not already broken | nothing_to_change, not_found, invalid_input |
| propose_profile_update | Any of `goals`, `injuries_and_limits`, `weekly_schedule`, `notes`. And or a `gym`: id to edit or none for new, `name`, `equipment`, `notes`, `make_default` | At least one change is present | not_found, invalid_input |

**Bundled proposals** (decided 17 Nov, question 22). A workout or campaign proposal can bring its own new exercises (and, for a campaign, new workouts) in the same proposal, so a plan with new movements needs only one approval. One card lists everything, new exercises first, and one Accept applies all of it or none. "Unknown exercise" as an error now means not in the library and not defined in the same proposal. A today proposal cannot bundle new exercises; a swap or an add today names an exercise already in the library.

**Breaking a superset through the coach** (decided 17 Nov, question 41). A coach can propose `break_superset` as a today-only change, for example when the user says a machine is taken. How it is applied is this design's own choice: accepted during a live session, it breaks the superset inside that session, exactly as the phone's own Break superset does. It does not end the session or start a new one, unlike a today proposal that replaces the workout. Accepted before the session starts, it is held in today's prepared plan (`today_plans`), which simply lists the members as individual exercises. `get_today`, `list_sessions`, `get_weekly_summary` and History show the exercises as they were actually done, with a note that they were broken out of a superset.

A today proposal expires at the 3:00 am day rollover that ends its day (decided 17 Nov, question 24). A new campaign from an accepted proposal arrives as a draft, and the user activates it (question 21). A propose call repeated word for word within a minute returns the first proposal, so a coach app that retries does not fill the inbox with copies.

### What the connector may not do

- It never calls out to any LLM or any other service. It only answers.
- A coach sign-in can read the user's rows and add rows to `proposals` and `proposal_targets`. The database refuses every other write from a coach sign-in. Even a mistake in the connector's code cannot change a workout.
- Applying a proposal happens only when the signed-in user taps Accept in the app.

---

## 4. Sign-in

**In short:** you sign in to the app with a passkey (Face ID or Touch ID), no password, and the app sends no email. An emailed code is the fallback only if passkeys fail their test. Your coach app signs in to the connector by sending you to a Chalk and Iron page where you approve it once. Each person's data is fenced off by the database itself.

### Signing in to the app

Decided 16 November: passkey sign-in is the first choice (see "Sign-in without any email" below). The emailed link and code described here are the fallback, used only if the passkey test at the start of Phase 1 fails.

1. The user types their email. The app sends an email holding a sign-in link and a six-digit code.
2. In a desktop browser the link signs them in. In the iPhone home-screen app they type the code.
3. After the first sign-in the app offers a passkey (Face ID or Touch ID), so later sign-ins need no email.
4. The sign-in stays active on that device until the user signs out.

Why the code: on an iPhone, a link tapped in Mail opens in Safari. Safari and the home-screen app do not share sign-ins, so the link would sign in the wrong place. A typed code works inside the home-screen app. Nathan agreed this on 16 November as the fallback route (Decisions, row D).

- **Recovery** is the same email flow. There is no password to forget.
- **Sign-out** ends the sign-in on that device and clears what the app stored on it, after sending anything still unsent.
- **Deleting an account** offers an export (a zip holding one spreadsheet file per kind of record, plus one complete file for moving to another tool: question 32), marks the account, and a daily job removes everything 14 days later. Signing in during those 14 days offers to cancel.
- **Passkeys** are to confirm: if Supabase's sign-in does not support them directly, they are added with a small standard library or moved to a later phase.
- **Registration** is by single-use invite link from an admin. See "Invites and the admin page" below.

### Invites and the admin page

Decided by Nathan on 16 November.

- **Admins.** An account is either an ordinary user or an admin. Nathan's account is made the first admin once, when the app is set up. An admin can make another user an admin. An ordinary user cannot invite anyone.
- **Invite links are single-use.** Each link registers one account and then stops working. It also stops after 7 days if unused, and an admin can cancel it at any time.
- **Ready-to-paste invite.** Making an invite shows a block of text holding the link and the setup steps (register, add to the home screen, allow notifications, connect a coach). The admin copies it into their own email or message. The app sends nothing.
- **The admin page** shows the list of accounts (name, email, date joined, active or inactive) and the list of links (waiting, used, expired, cancelled).
- **What an admin can do** (decided 16 November):
  - **Create.** Type a person's name and email and get their single-use invite, as ready-to-paste text.
  - **Deactivate.** Block an account at once. The person cannot sign in and their coach connection stops. Nothing is deleted.
  - **Reactivate.** Undo a deactivation. Everything is as it was.
  - **Reset.** For someone who is locked out, or whose sign-in may be in the wrong hands. The app makes a single-use reset link and ready-to-paste instructions for the admin to send. **Making the link cuts off the old sign-in at once** (changed by Nathan, 17 Nov 2026, after testing a real reset): the person's passkeys are removed, sign-in is blocked in Supabase until the link is opened, their coach apps are disconnected, and the database refuses every pass issued before the reset. Opening the link is then the only way back in: it sets up a new passkey. They reconnect their coach afterward.
  - **Delete.** Remove an account and all its data, after the same 14-day grace period as a self-service delete. During those 14 days an admin can undo it (decided 17 Nov, question 38).
  - **Make or unmake an admin.**
- **Safeguards.** The last remaining admin cannot be deactivated, deleted or unmade. Every admin action is recorded with who did it and when.
- **What an admin cannot do.** An admin sees no one else's workouts, history, notes, coach profile or proposals. The rule that each user sees only their own data has no admin exception. The admin page reads account details only. One honest limit: whoever holds a reset link can get into that account, and an admin makes reset links. So a reset always signs the person out everywhere and shows them a notice the next time they sign in, which means a reset cannot happen quietly.

### Sign-in without any email (first choice, Decisions row H)

With the weekly email deferred and invites pasted by hand, sign-in is the only thing left that needs an email service. It could be dropped too:

1. A friend opens their invite link, types a name and email address (kept as a contact detail only), and creates a passkey with Face ID or Touch ID.
2. From then on, signing in is one Face ID or Touch ID check. Apple keeps the passkey in iCloud Keychain, so it is available in Safari and in the home-screen app alike, and on the person's other Apple devices. The Safari problem in row D does not arise.
3. On a computer without the passkey, the sign-in page shows a code to scan with the phone.
4. If someone is locked out, an admin resets their sign-in from the admin page and sends them the ready-to-paste reset instructions. The app sends no email.

What it depends on, none of it confirmed yet: that Supabase's sign-in can use a passkey as the only sign-in method, that passkeys work inside the iPhone home-screen app, and that they work on the page ChatGPT and Claude open when connecting a coach. The early sign-in proof tests all three. If any fails, the design falls back to the emailed link and code above, which needs an email service and a domain. A passkey is still offered in that case wherever it works.

### Signing the coach in to the connector

Both ChatGPT and Claude connect to a custom connector the same way, using the standard sign-in method the MCP protocol requires (OAuth 2.1).

1. The user pastes the connector link into their coach app.
2. The coach app calls the link, is told "sign in first", and is pointed to Chalk and Iron's sign-in.
3. The coach app opens a Chalk and Iron page in the browser. The user signs in if needed (by passkey, or by emailed code if the fallback is in use), and sees one plain question: "Allow ChatGPT to read your training data and send you proposals?"
4. On Allow, the coach app receives its own pass. The user never sees or copies a key.
5. The pass is short-lived and renews itself quietly. It is tied to one user and marked as a coach pass.
6. Settings lists connected coach apps with a Disconnect button. Disconnecting cancels the pass at once.

**Who issues the passes.** Recommended: Supabase's own sign-in service, which I understand now offers this (acting as an OAuth 2.1 server, with self-registration for apps such as ChatGPT and Claude). That keeps app sign-in and coach sign-in in one place. This is the most important item to confirm, because Phase 0 ran with no sign-in at all. Fallbacks, in order: a sign-in company built for this (WorkOS, Stytch), or a small sign-in server written inside the app. The second is the riskiest and the last resort.

**ChatGPT and Claude differences.** The mechanism is the same. The setup screens differ, so the Coach setup page has separate steps for each. Each app registers itself with the connector in its own way, and the design supports both common ways. Claude as a coach has never been tested (a carried open item). ChatGPT has been tested only without sign-in.

**Proving it early.** Connector sign-in is named a "hard spot" in `docs/MODEL_AND_EFFORT.md`. Phase 1 starts with a small proof: sign-in plus one read tool on real accounts, tested from ChatGPT and from Claude, on the web and on the iPhone. If it fails, the fallback is chosen before the data model is built on top of it. This moves a slice of Phase 4 work forward. Nathan approved it on 16 November (question 31). The same proof tries passkey-only sign-in (Decisions, row H).

### Keeping one user's data from another's

Three layers, each enough by itself:

1. **The database refuses.** Every table carries `user_id`, and row-level security lets a signed-in user see and change only their own rows. This holds even if the app's code has a bug.
2. **The connector acts as the user.** It reads the database with the user's own pass, not with an all-powerful key. A coach pass is narrower still: read, and add proposals.
3. **Tests prove it.** For every table and every connector tool, an automated test signs in as user A and tries to read and write user B's data. Every attempt must fail.

The all-powerful database key is used only by background jobs (alerts, auto-finish, expiry, clean-up), kept in one small module, and never by anything that handles a user's request.

---

## 5. Lifecycles

**In short:** a session, a proposal and a campaign each move through a few named states. These tables say what is allowed in each, following Section 10 of the spec.

### Session

| State | How it starts | Allowed | Not allowed |
|---|---|---|---|
| Planned (no session yet) | A campaign day, a missed day, a sent day or any library workout | Start it. Pull it to another day. A today proposal, or a day sent from the planner and accepted, can change the plan | |
| Active | Start is tapped. The plan is copied into the session at that moment | Start exercise, log, undo, edit or delete sets, switch warm-up, set details (type and RPE), skip, reorder, add, swap, break a superset, navigate, finish (always available, confirms if sets remain) | Changing the library by any of the above. Starting a second session while this one is active |
| Finished, within 48 hours | Finish workout, or 30 minutes with no activity (end time is the last logged entry) | Reopen: clocks resume and the closed time is not counted. Edit or delete sets from History | |
| Finished, after 48 hours | Time passes | Edit or delete sets from History. Records are recalculated | Reopening. Restarting clocks |

Also:

- A session belongs to the day it started, by the 3:00 am rule. It keeps running across 3:00 am.
- Only one session can be active at a time, on any device. Starting another offers to resume or finish the first (decided 17 Nov, question 30).
- Navigating to another exercise pauses the exercise clock of the one left. Coming back resumes it by itself (Section 7).
- Three things on the phone reach beyond the session. A swap to an alternate not in the library adds that exercise to the library (Section 2). The lb/kg switch is a remembered display choice and is not a library edit (decided 17 Nov, question 3). The one-line note is a deliberate edit by the user to the exercise (confirmed by Nathan, 17 Nov).
- **Supersets stay paired and equal during a session** (decided 17 Nov, questions 10, 11 and 39). Switching a set to a warm-up inside a superset applies to that round for every member: each member's set in that round becomes a warm-up, and each member gains one working set. Switching back undoes it for all members, if the added sets are not logged. One member can be swapped for another exercise, and the new one takes the same sets. Still assumed, awaiting Nathan's confirmation: Skip inside a superset skips the whole superset's remaining rounds, and one member cannot be skipped by itself. To drop one member, the user can break the superset first (below) and then skip that exercise.
- **Breaking a superset** (decided 17 Nov, question 41). When equipment for a superset is taken, the user can break it into individual exercises for this session. Each keeps its sets, reps and weight as defined.
  - A break splits every member apart, including in a superset of three. Pulling one member out while keeping the other two paired is not offered.
  - It is done on the phone during a session and changes only that session. The library workout and the campaign are not changed.
  - It can be done before the superset is started or part-way through. Sets already logged stay as logged. Only the sets left are done as individual exercises.
  - It can be undone until a set is logged after the break. After that the exercises stay individual for the rest of the session.
  - It is reached from the superset label on the active workout screen and from the superset's rows in the workout tray. New, not in the prototype.
  - This design's own choices, not yet shown to Nathan: the exercises keep the superset's place in the order, one after another, and can be reordered in the tray like any exercise; once broken, the paired warm-up rule and the equal-sets rule no longer apply to them.
- Finishing a workout part-way through a superset round can leave the members with different numbers of logged sets. That is a record of what happened, not a plan, and it is allowed.
- Sets left undone when a session finishes are marked Skipped and left out of efficiency. An exercise never started is Skipped.
- Only a proposal that replaces today's workout with a different one, such as a day sent from the planner, splits a running session (decided 17 Nov). If one is accepted mid-session, the session finishes with reason "replaced" and becomes an ad hoc session holding the work done. Its unreached sets are marked Replaced and left out of efficiency. A new session starts from the proposed workout.
- Every other today change accepted mid-session (swap, sets, reps, weight, rest, add, remove, reorder, break a superset) is applied inside the running session, to sets not yet logged. The session carries on.
- Editing a workout or exercise never changes any session, active or finished.

### Proposal

| State | Meaning | What can happen next |
|---|---|---|
| Pending | Waiting in the inbox | Accept, Decline (or Dismiss, the same thing), become out of date, expire |
| Accepted | Applied in full | Final |
| Rejected | Declined or dismissed. Nothing changed. Decline and Dismiss are the same action (decided 17 Nov, question 5) | Final |
| Out of date | The user edited something it would change, or has since added an exercise with the name of one it bundles. Cannot be accepted | Dismiss. Final |
| Expired | A today proposal whose day ended at the 3:00 am rollover | Final |

The five states are decided (17 Nov, question 4), and the coach can see each one through `get_proposal_status` and `list_proposals`.

- **Accept** is one all-or-nothing step in the database. First it re-checks that every record the proposal targets is unchanged since it was made. If that fails, the proposal becomes out of date and nothing is applied.
- **A bundled proposal** (question 22) is accepted the same way. In that one step it creates the new exercises, then any new workouts, then applies the workout or campaign change. If any part fails, none of it is kept. Decline creates nothing. Before Accept, the names of the bundled new exercises are checked again against the library, so an exercise the user added in the meantime under the same name makes the proposal out of date rather than creating a duplicate.
- Accept and Decline need a connection, because the server applies them.
- A proposal never blocks anything. The user can edit freely while one is pending.
- What each kind applies to: exercise and workout proposals change the library. Campaign proposals change a campaign, and a new campaign arrives as a draft. Bundled new exercises and workouts join the library. Today proposals change only the live session or today's prepared plan. Profile proposals change the coach profile or a gym.
- A day sent from the planner when today already has a workout follows the same states as a coach's today proposal, with source 'planner' (question 20).
### Campaign

| State | Allowed | How it leaves |
|---|---|---|
| Draft | Made by the user, by copying, or by accepting a coach's new campaign. Edit everything. Copy. Any number can wait as drafts | The user activates it. If another campaign is active, activating ends it after a confirmation (decided 17 Nov, question 21) |
| Active | Edit days and overrides at any time. Shift forward a week. Days become done or missed as time passes. Only one at a time | Its last day passes, or the user ends it |
| Finished | Read. Copy into a new draft. Its sessions stay in History | Final |

- Weeks run Monday to Sunday. A campaign may start on any date, and week 1 is the week holding its start date (decided 17 Nov, question 19).
- When the active campaign finishes, the app prompts the user to ask their coach for the next one. It does not repeat or extend.
- A day is **missed** when its date has passed with no session from it. Nothing moves. A missed workout stays available to start on a later day.
- A day is **done** when a session that came from it exists, whatever date that session was logged on.

---

## 6. Offline and sync

**In short:** during a workout the phone is the working copy and needs no connection. Everything logged is saved on the phone first and sent to the server when it can be. Each change carries its own id, so sending it twice does no harm.

### What is stored on the phone

- The app itself, so it opens with no connection.
- Fonts, theme tokens and background images.
- The whole library: exercises with alternates, workouts, vocabulary.
- The phone's remembered lb/kg choice for each exercise.
- The active campaign and today's plan.
- The active session in full: plan, sets, clocks, rest timer, position.
- For each exercise: last session's numbers and current records, so "last time" and record celebrations work offline.
- The outbox: changes made but not yet confirmed by the server.

### How sets logged offline are sent later

1. Tapping Log set writes the set to the phone's storage and to the outbox in one step, then shows it. The screen never waits for the network.
2. Each outbox entry has a unique id, made on the phone.
3. When there is a connection the outbox is sent in order. The server records each entry's id as it applies it.
4. If the phone never hears the answer, it sends the entry again. The server sees an id it already has and simply answers "done".
5. An entry leaves the outbox only when the server confirms it.

That is what makes "a set logged with no connection appears exactly once after reconnecting" true. The outbox is sent when the connection returns, when the app opens and after each new change.

Closing the app mid-session loses nothing, because the session lives in the phone's storage, not in memory. Reopening reads it back and returns to the same exercise.

### What wins in a conflict

Conflicts are rare here, since one person owns the data and usually uses one device at a time. The rules:

| Case | What wins |
|---|---|
| A session is in progress and the library or campaign is edited in the planner | No conflict. The session uses the plan it copied at the start |
| The same set is edited on the phone and in History on the desktop | The last change to reach the server wins, for that set |
| A set is deleted in one place and edited in another | The delete wins |
| A session is started offline and today's plan was changed on the server meanwhile | The session keeps the plan it started with. The user is told the plan changed |
| The phone works out a record offline and the server disagrees | The server wins. The badge is corrected quietly on the next sync |
| A proposal is accepted while a session has unsent sets | Accept needs a connection, and the outbox is sent first |
| A note edited on the phone offline and the same exercise edited in the planner | The last change to reach the server wins, field by field |
| The phone's lb/kg switch changed offline | Saved and sent like any other change. It is not a library edit, so it never conflicts with the planner and never makes a proposal out of date |
| An exercise made by a swap while offline | It is created on the phone with its own id and sent with the outbox. If the user confirms its suggested details later, that is sent as an ordinary edit |

Not available offline: sign-in, Accept and Decline, the planner, and anything the coach does.

---

## 7. Timers and notifications

**In short:** no clock is a running counter. Each clock is a start time written down, and the screen works out the reading from the current time. Closing the app cannot stop a clock that way. A rest alert for a backgrounded iPhone is sent by the server.

### How the clocks survive a closed app

Each clock is stored as two numbers: seconds already banked, and the moment it last started running (empty when stopped).

- Reading now = banked seconds + (now − the moment it started running).
- Pausing a clock moves the running time into the bank and clears the start moment.

| Clock | Starts | Stops or pauses |
|---|---|---|
| Workout clock | Session start | Finish. Resumes on reopen with the closed time left out. Moving between exercises does not affect it |
| Exercise clock, one per block | Start exercise | Pauses when the user moves to a different exercise, by previous or next or from the tray. Resumes from where it stopped when the user comes back. Stops for good when the last set of the exercise or superset is logged, or when the superset is broken apart |
| Rest timer | After a set, or after the last member of a superset round. After a superset is broken, after every set of each exercise | Stored as the moment rest ends. +0:15 moves that moment. Skip clears it |

**After a superset is broken** (decided 17 Nov, question 41). The superset's shared clock stops at the break. Where its time so far goes is this design's own choice: it stays with the superset and counts toward efficiency for the sets logged before the break (Section 2, `session_blocks`). Each exercise then has its own clock, which starts at its own Start exercise, and its own budget by the single-exercise formula for its sets left. Rest follows every set, using that exercise's own planned rest (the day override's, else the workout row's, else the exercise's), since the shared superset rest no longer applies. Own choice: a rest already running at the moment of the break carries on.

**Moving between exercises** (decided 17 Nov, question 9). Only the exercise on screen in the workout has a running clock. Moving to another exercise pauses the one left. The new exercise's clock starts when Start exercise is tapped there. Coming back to the first exercise resumes its clock from where it stopped. A superset's members share one clock, so moving between members does not pause it. "On screen" means the exercise the workout is showing: locking the phone or closing the app does not pause it, and it keeps counting past double the budget. This matches the prototype. The clock resumes by itself when the user returns to a started, unfinished exercise, with no extra tap. Nathan confirmed both points on 17 November.

These values are saved on the phone with the session and synced. After a crash, a closed tab or a restart, the app reads them and shows the correct times at once. The dial is drawn from the same numbers by the shared rules, so the acceptance tests for half, empty, half red and full red test plain arithmetic.

Auto-finish: when 30 minutes pass with nothing logged, the phone finishes the session on next open, and a server job does the same for sessions it knows about. Either way the end time is the last logged entry and the clocks are cut back to it.

### Rest end with the app on screen

A banner and a short sound, made by the app. The sound is set up so it mixes with music from other apps and does not interrupt it. The sound is unlocked by the user's own tap on Log set, which iPhones require.

### Rest alert with the app in the background

An iPhone suspends a web app shortly after it leaves the screen, so the app cannot ring its own alarm. The server does it.

1. When rest starts, the phone tells the server the moment rest will end. +0:15 updates it. Skip cancels it.
2. A scheduler inside Supabase looks every few seconds for alerts about to come due and hands them to the app's server, which waits out the last moments and sends a push notification on the second.
3. The phone shows "Rest over. Time for your next set." Tapping it opens the app at the current exercise.
4. If the app is on screen when rest ends, the app cancels the alert just before, so the user gets the banner and sound and not a notification as well.

Limits, stated plainly:

- It needs a connection at the moment rest starts and the moment it ends. With no signal there is no background alert. The spec accepts this.
- It works only after the app is on the home screen and notifications are allowed, so setup walks through both, in that order.
- It will not show on the lock screen as a live countdown. That waits for the native app.

**Screen stays awake:** the app asks for Screen Wake Lock when a session is active and asks again whenever the app returns to the screen.

**Proposal notifications** use the same push route, sent when a proposal is created.

Timers that survive a closed app are a "hard spot" in `docs/MODEL_AND_EFFORT.md` and go to an Opus 5.5 high-effort helper during the build.

---

## 8. Theme tokens

**In short:** every color, font, corner and shadow lives in a small set of token files. The app's styles contain only references to tokens. A check in the build fails if a color or font appears anywhere else.

### Files

```
tokens/
  skins/chalk.json
  skins/arcade.json
  skins/liquid.json
  accents.json
  backgrounds.json
  fixed.json
```

### A skin file

Every skin defines the same token names. Values below are the prototype's.

```json
{
  "id": "chalk",
  "name": "Chalk and Iron",
  "tokens": {
    "background": "#0d0d0d",
    "text": "#f2efe6",
    "muted-text": "#b5b1a6",
    "line": "#33312d",
    "border": "#6b6860",
    "surface": "transparent",
    "sheet": "#1a1917",
    "accent": "#ff5a26",
    "on-accent": "#0d0d0d",
    "secondary-accent": "{accent}",
    "selected-fill": "#f2efe6",
    "dial-fill": "#3a3833",
    "display-font": "Anton",
    "body-font": "Inter",
    "radius": "0px",
    "radius-small": "0px",
    "shadow": "none",
    "heading-size": "34px",
    "numeral-size": "46px"
  },
  "extras": {
    "on-selected": "#0d0d0d",
    "display-weight": "400",
    "display-case": "uppercase"
  }
}
```

- `tokens` holds exactly the nineteen tokens Section 6 of the spec lists.
- `extras` holds three values the prototype uses that the spec's list does not name: text color on a selected button, display font weight, and whether headings are in capitals. Decided 17 Nov (question 27).
- A value in braces, such as `{accent}`, points at another token.

### Accents, backgrounds and the fixed color

`accents.json` holds the seven named accents from the spec, plus the text color on any accent:

```json
{
  "on-accent": "#0d0d0d",
  "accents": [
    { "id": "ember",   "name": "Ember",   "value": "#ff5a26" },
    { "id": "purple",  "name": "Purple",  "value": "#a855f7" },
    { "id": "pink",    "name": "Pink",    "value": "#ff4fa3" },
    { "id": "crimson", "name": "Crimson", "value": "#ff2d55" },
    { "id": "blue",    "name": "Blue",    "value": "#2d7dff" },
    { "id": "yellow",  "name": "Yellow",  "value": "#ffd60a" },
    { "id": "green",   "name": "Green",   "value": "#39e75f" }
  ]
}
```

- A chosen accent replaces the skin's `accent` and sets `on-accent` to near-black. No choice means the skin's own default.
- `backgrounds.json` lists flat, steel plate and chalkboard for the Chalk and Iron skin. Each names a pre-rendered image file and the few tokens it adjusts (muted text, line, border, dial fill, sheet), as the prototype does. Chalkboard also names its frame color.
- `fixed.json` holds the single fixed color, the dial's overage red.
- The record celebration's color cycle takes its colors from `accents.json`, so it adds no new colors.

### How tokens reach the screen

- A build step turns the token files into CSS variables, one block per skin.
- Switching skin sets one attribute on the page. It is instant and needs no reload.
- The planner uses the same tokens as the phone.
- The layout's positions and sizes are written once, apart from the tokens, and never refer to a skin. Text sits in boxes of fixed height, so a skin with a larger heading size cannot push anything else. Text sizes may differ by skin, boxes keep fixed sizes, and nothing moves (decided 17 Nov, question 7).
- The build fails if a color value or font name appears in any file outside `tokens/`.
- The record card always shows in the Arcade skin and the workout summary in Liquid Color, whichever skin the user has chosen. The per-user gate applies to what the user can select, not to these moments.

---

## 9. Testing

**In short:** almost every acceptance test in Section 8 of the spec is arithmetic or a rule, so it is tested directly and fast. A smaller set is tested by driving the real app in a test browser. Four need a real iPhone, as the spec marks, and I suggest adding a few more device checks.

### Layers

| Layer | What it is | Tool |
|---|---|---|
| Rules | The shared rules module, tested with plain inputs and outputs | Vitest |
| Database | A local copy of the database with two test users | Vitest against local Supabase |
| Connector | Real MCP calls against a local server, signed in as test users | Vitest |
| App | The real app driven in a test browser, including the iPhone's browser engine and an offline switch | Playwright |
| Code checks | Scans of the codebase run on every pull request | Small scripts |
| Device | Nathan, by hand, on an iPhone | A written checklist per phase |

All automated tests run on every pull request. One of the code checks compares `docs/COACH_INSTRUCTIONS.md` with the connector's tool list and fails if the instructions name a tool that does not exist or leave one out, so the coach instructions cannot fall behind the connector. A phase is not offered for acceptance until they pass.

### Each acceptance test

| Spec group | Test | Layer |
|---|---|---|
| Units and entry | 27.5 kg stores 60.627 lb and shows 27.5 kg | Rules, App |
| | Switching lb to kg turns 60 lb into 27.2 kg, history then in kg, library default unit unchanged | Rules, App, and Database for the unchanged exercise |
| | Weight steps of 5, reps steps of 1 | Rules, App |
| | Weight not below 0, reps not below 1 | Rules, Database |
| | Seeded weight: sets 1 and 2 from last time's sets 1 and 2, set 3 from last time's heaviest. Tapping clears, logging untouched commits | Rules, App |
| Supersets and rest | First member moves to second with no rest | Rules, App |
| | A warm-up switch in a superset changes that round for every member and adds one working round | Rules, App |
| | Breaking a superset before it starts: each exercise keeps its sets, reps and weight, gets its own budget (9:00 and 7:10 in the spec's example), and the library workout is unchanged | Rules, App, and Database for the unchanged workout |
| | Breaking a superset after 2 of 4 rounds: the 4 logged sets stay, each exercise has 2 sets left, and the superset's time so far counts toward efficiency | Rules, App |
| | A `break_superset` today proposal accepted mid-session breaks the superset in the same session | Connector, Database |
| | Second member starts rest and returns to first | Rules, App |
| | +0:15 adds 15 seconds, Skip ends rest | Rules, App |
| | Banner and sound at zero | App, with a controlled clock. The sound is checked as "asked to play" |
| | Background notification at rest end | **Device**. The server side (alert scheduled, sent, cancelled on Skip) is automated |
| Time budget, dial, efficiency | Superset budget 11:40. Single budget 7:30 | Rules |
| | Clock does not run before Start exercise | Rules, App |
| | Moving away pauses the clock, coming back resumes it, moving within a superset does not pause it | Rules, App |
| | Fill at half, full, one and a half, double and 3.2 times the budget | Rules |
| | 83% efficiency example | Rules |
| Records | All five record tests, including a tie earning no badge and moving the record's date | Rules, then Database for recalculation after an edit or delete |
| Graph | Three equal bars labeled 8, 8, 7. Volume point 1,380 lb | Rules for the numbers, App for the drawing |
| | Bodyweight: three equal bars labeled 20, 18, 15. Volume point 53 BW | Rules for the numbers, App for the drawing |
| Library never changed by use | Override on Monday week 3 leaves the rest at 8 | Database |
| | Swap leaves the library workout unchanged | Database, App |
| | Rename keeps history and records | Database |
| | Editing a workout does not change a past session | Database |
| Coach | A propose call creates one pending proposal and nothing else | Connector, comparing the whole database before and after |
| | Accept applies all, Decline none | Database |
| | A workout proposal bundling a new exercise: Accept adds both, Decline adds neither | Database, Connector |
| | Status readable after either | Connector, through `get_proposal_status` and `list_proposals` |
| | Today proposal leaves library, campaign and logged sets alone | Database |
| | Outside-vocabulary value is an error and never reaches the inbox | Connector |
| | A superset with members of different set counts, or with more than three members, is an error and never reaches the inbox | Connector, for workout, campaign and today proposals |
| | One user's connector cannot reach another's data | Connector and Database, every tool and every table |
| | No outgoing call to any LLM service | Code check: a scan for LLM libraries and addresses, plus a test that the server makes no outside calls beyond an allowed list (push notifications, and the email service if one is used) |
| Theming | Switching skins moves and resizes nothing | App: record every element's position and size under each skin and compare |
| | No color or font outside the token files | Code check |
| | Reduced motion: no dust or shake | App, with reduced motion switched on |
| Resilience | Close mid-session and reopen, same exercise, sets and clocks correct | App: close the page, move the clock forward, reopen |
| | Offline set appears exactly once | App with the network off, then on. Also Database: the same change sent twice |
| | Screen stays awake for a full session | **Device** |
| Friends | A new user registers, installs and connects a coach unaided | **Device**, with a friend |

### Device checks I suggest adding

These are not in the spec's list but cannot be trusted from a desktop test:

- The passkey signs in inside the home-screen app (or the emailed code, if the fallback is used).
- The rest sound plays without stopping music from another app.
- The notification permission prompt appears only after the app is on the home screen.
- The connector sign-in completes from the ChatGPT iPhone app and the Claude iPhone app.
- A session survives the phone being locked for ten minutes mid-rest.

The three platform facts in Section 7 of the spec (notifications from iOS 16.4, server-sent rest alerts, wake lock from iOS 18.4) are confirmed on a real iPhone in Phase 1, as the spec asks.

---

## 10. Open questions

These are places where the spec is unclear, silent or disagrees with itself. They are listed, not resolved. Each has the assumption this design makes so that work is not blocked. Nathan's answer replaces the assumption.

Nathan answered this whole list on 17 November, in two rounds. Every row is now decided, and the rest of this design and the spec follow it. Three rows still carry a small detail marked "awaiting Nathan's confirmation": question 12 (four details of the seeded weight), question 14 (how bodyweight volume sits beside a workout's pounds total) and question 39 (Skip inside a superset). Question 40 records a new rule from Nathan. Question 41 records his feature request to break a superset during a workout, decided on 17 November. A few details of how it works are this design's own choices, marked as such in that row.

### A. The spec disagrees with itself

| # | Question | Where | Assumed until decided |
|---|---|---|---|
| 1 | Who may register? "Nathan and a small group of friends" on a public web address, with self-service registration and no stated way to keep strangers out | Sections 2 and 10 | **Decided 16 Nov:** single-use invite links, made only by an admin on an admin page. The spec is updated |
| 2 | Converted weights: Section 8 expects 60 lb to show as 27.22 kg (two decimals). Section 10 says converted weights show to one decimal (27.2). The prototype rounds to the nearest half | Sections 8 and 10 | **Decided 17 Nov:** one decimal. Converted weights show to one decimal, so the acceptance test now expects 27.2 kg. A typed value still shows exactly as typed, and storage stays at three decimals in pounds (27.5 kg still stores as 60.627 lb). The spec is updated |
| 3 | "The library is never changed by use", yet the phone's unit switch and note line change the exercise during a workout | Sections 1, 2 and 5 | **Decided 17 Nov:** the phone's lb/kg switch is a remembered display choice, kept apart from the exercise's library design. The exercise keeps its default unit as a library field, changed only by a deliberate edit in the planner or an accepted proposal. The switch is stored separately per exercise (`exercise_display_units`), does not raise the exercise's version and never makes a proposal out of date. On the phone, history, records and graphs show in the remembered unit. Bodyweight is not switchable. The spec is updated. Confirmed by Nathan later on 17 Nov: the one-line note typed on the phone is a deliberate edit by the user to the exercise; and a later change to the default unit in the planner leaves the phone's remembered choice as it is |
| 4 | Proposal states: Section 3 lists pending, accepted, rejected. Section 10 adds out of date, and today proposals expire. Section 4 says `get_proposal_status` returns one of three | Sections 3, 4 and 10 | **Decided 17 Nov:** five states (pending, accepted, rejected, out of date, expired), all visible to the coach. The spec is updated |
| 5 | "Decline discards it" and "any proposal can be dismissed at any time". Are Decline and Dismiss the same thing? | Sections 4 and 10 | **Decided 17 Nov:** yes. Both end as rejected. The spec is updated |
| 6 | Sign-in by emailed link does not work inside the iPhone home-screen app | Section 9, decision 4 | **Decided 16 Nov:** agreed, as the fallback route. Passkey sign-in is the first choice (question 35) |
| 7 | Skins must not resize elements, yet heading size and numeral size are tokens that differ by skin | Sections 1 and 6 | **Decided 17 Nov:** text sizes may differ by skin. Boxes keep fixed sizes, so nothing moves. The spec is updated |
| 8 | Section 9 opens with "seven points are not yet decided" and "rows 4 and 6 to 10 are confirmed", but the table has fourteen rows | Section 9 | **Decided 17 Nov:** cleaned up. The opening of the spec's Section 9 now says which rows are answered, confirmed, changed or approved, and which are still open. Row 5 (hosting and stack) now says it is approved |

### B. The spec does not say

| # | Question | Assumed until decided |
|---|---|---|
| 9 | Does the exercise clock keep running when the user moves to another exercise and comes back? The spec says it never stops while the exercise is "open". The prototype pauses it when you leave | **Decided 17 Nov** (Nathan said no to the earlier assumption): moving to another exercise pauses that exercise's clock. The other exercise's clock starts when Start exercise is tapped there. Coming back to the first exercise resumes its clock from where it stopped. This matches the prototype. Members of one superset share one clock, so moving between them does not pause it. The workout clock is unaffected. The spec is updated. Confirmed by Nathan later on 17 Nov: the clock resumes by itself when the user returns to a started, unfinished exercise, with no extra tap; and locking the phone or closing the app does not pause it |
| 10 | Superset budget when members have different set counts. The spec's formula assumes equal rounds | **Decided 17 Nov:** supersets are always paired and equal, in the design and during a live session. Every member has the same number of sets; reps can differ. So the budget is the spec's own formula: rounds × the sum of each member's work seconds + (rounds − 1) × the first member's rest. Any change to sets in a superset applies to all members: in the planner and day overrides the app changes them together, and a coach's proposal or today change must change them together or is returned as an error. An exercise joining a superset takes its set count (confirmed by Nathan). This reverses the spec's earlier rule on uneven supersets, and the spec is updated. For the live session, see question 39 |
| 11 | Which rest applies to the solo rounds at the end of an uneven superset: the remaining member's, or the first member's? | **Decided 17 Nov:** does not apply. Supersets are always equal, so there are no solo rounds (questions 10 and 39) |
| 12 | The "seeded" weight: the weight pre-filled in the weight box when a day sets no weight. A workout item has no weight field, so where does that first number come from? | **Decided 17 Nov:** the box for set N is pre-filled with the weight of set N from the last session in which the exercise was done. Nathan's example: if set 1 was 80 lb and set 2 was 90 lb last time, today's set 1 seeds 80 and set 2 seeds 90. If that session had no set N, the box is pre-filled with the heaviest set from it. Tapping into the box clears it ready for a new number. Logging without touching it commits the seeded value, keeping its exact pounds value, as with a converted weight. The spec is updated. Still assumed, awaiting Nathan's confirmation: (a) "the heaviest previous set" means the heaviest set of that last session, not of today's; (b) a weight set by a campaign day override or an accepted proposal wins over the seed; (c) the very first time an exercise is done, the box is empty; (d) reps are pre-filled from the planned reps, as now |
| 13 | How is a drop set marked, and where is RPE (an effort rating: a 1 to 10 score for how hard a set felt) entered? Neither is in the prototype | **Decided 17 Nov:** a long press on a set row opens set details: type and RPE. The spec is updated |
| 14 | Bodyweight exercises: what counts as volume, and how are bars drawn? | **Decided 17 Nov:** a bodyweight set is recorded as a weight of 1 bodyweight unit ("1 BW") and a rep count. Nathan's example: 20 push-ups is a weight of 1 BW and a count of 20. Its volume is 1 × reps, counted in BW units and kept apart from pounds totals. On the graph, the bars are all the same height (1 BW) with the reps on top, and total reps plays the part that volume plays for a weighted exercise, including the volume line. The spec is updated. Still assumed, awaiting Nathan's confirmation: a workout's summary shows bodyweight volume as its own figure beside the pounds total, for example "8,450 lb · 60 BW", rather than adding the two together |
| 15 | Can a bodyweight exercise carry added weight (a weighted pull-up)? | **Decided 17 Nov:** no. It would be a separate exercise with a weight unit |
| 16 | A swap to an alternate not yet in the library: what muscle group, equipment and unit does the new exercise get? Only a name is stored | **Decided 17 Nov:** the swap creates the new exercise straight away. The phone shows a simple one-tap confirm of suggested details: muscle group, focus, work and rest seconds copied from the original; unit bodyweight for the bodyweight tier, otherwise the original's unit; equipment suggested where it can be. If the user does not confirm, the exercise still enters the library with whatever is known, and missing fields stay empty. The planner flags exercises with missing fields as incomplete and never blocks their use. Those fields are optional only for this case, and stay required for a coach's proposed exercise (Section 2). The spec is updated. Confirmed by Nathan later on 17 Nov: a swap-made exercise starts with no alternates, and that does not make it incomplete |
| 17 | Records and ties, and records within one session. Does a second set today that beats the first set today count? | **Decided 17 Nov:** a record must strictly beat the best before that set, including earlier sets today. A tie is not a record and gets no celebration or badge. Nathan's addition: when a set ties the best, the date shown for that record moves to the most recent date it was achieved. The spec is updated. Confirmed by Nathan later on 17 Nov: the record then also shows that latest set's reps, where they differ (for example 60 lb × 10 tying a 6+ record of 60 lb × 8) |
| 18 | Estimated one-rep max "taken from the best set". Best by what measure, and over what period? | **Decided 17 Nov:** the set with the highest estimate, over all history, working and drop sets only. The spec is updated |
| 19 | Must a campaign start on a Monday? Which day starts the week? | **Decided 17 Nov:** weeks run Monday to Sunday. A campaign may start on any date, and week 1 is the week holding that date. The spec is updated |
| 20 | "Send to phone as today's workout" when the campaign already has a workout today. Does it replace it or sit beside it? | **Decided 17 Nov:** it gets the proposal treatment. It arrives in the inbox as a card saying what would replace what, with Accept and Dismiss. Accept makes it today's workout for today only and changes neither the library nor the campaign. Dismiss changes nothing. It comes from the user's own planner, so its source is 'planner'. The existing rule for accepting a today proposal mid-session applies unchanged. The spec is updated. Confirmed by Nathan later on 17 Nov: when today has no workout planned, a sent day becomes today's workout straight away, with no card. Also accepted: after Accept, the campaign's own day for today shows as Missed if not done, like any other day, and the user can remove it from the campaign if they do not mean to do it |
| 21 | When a proposed campaign is accepted, does it become active? What if another is active? | **Decided 17 Nov:** it arrives as a draft. The user activates it. Activating one ends the current one after a confirmation. The spec is updated |
| 22 | Can a workout or campaign proposal include brand-new exercises, or must each be proposed and accepted first? "Unknown exercises" are errors | **Decided 17 Nov:** bundled. A workout proposal may carry new exercises, and a campaign proposal may carry new exercises and new workouts, in the same proposal. One card lists everything and one Accept applies all of it or none. "Unknown exercise" as an error now means not in the library and not defined in the same proposal. Bundled new exercises pass every check a `propose_exercise` call would, including the three alternates. A today proposal does not bundle. The spec and the coach instructions are updated |
| 23 | Does the app require three alternates on a coach-proposed exercise, or is that only advice in the coach instructions? | **Decided 17 Nov:** required for a new exercise from a coach. Optional when the user adds one by hand. The spec is updated |
| 24 | When does a today proposal expire: midnight, or the 3:00 am rollover? | **Decided 17 Nov:** the 3:00 am rollover, to match how days work everywhere else. The spec is updated |
| 25 | Is gym equipment free text, or picked from the equipment vocabulary? | **Decided 17 Nov:** a free list. Gyms have things the vocabulary does not, such as a rower. The spec is updated |
| 26 | Removing or renaming a vocabulary value that exercises use | **Decided 17 Nov:** renaming carries through to every exercise, and a value in use is archived, not deleted. Example 1: renaming the equipment value "selectorized machine" to "pin machine" changes it on every exercise that uses it. Example 2: removing the focus value "brachialis" while an exercise uses it keeps it on that exercise but takes it out of the pickers, and it can be restored. Nathan's addition: the vocabulary is managed only in the browser planner, never on the phone, so the phone stays uncluttered. The spec is updated |
| 27 | The prototype uses three style values the spec's token list does not name: text on a selected button, display font weight, and heading capitals | **Decided 17 Nov:** added as "extras" in each skin file. The spec is updated |
| 28 | Who writes the starter library of about 40 exercises with alternates, and the starter work and rest seconds? | **Decided 17 Nov:** a project task in the development work. The coding agent drafts the list in Phase 1 for Nathan to review. The spec's roadmap is updated |
| 29 | The coach cannot see cardio, and cannot list its own past proposals. Neither has a tool | **Decided 17 Nov:** add both. Two new read tools, `list_cardio` and `list_proposals`, with contracts in Section 3. The connector now has nineteen tools: fourteen read and five propose. The spec and the coach instructions are updated |
| 30 | Can a user have two sessions active at once, for example on two devices? | **Decided 17 Nov:** no. Starting a second offers to resume or finish the first. The spec is updated |
| 31 | May a small sign-in proof for the connector be done at the start of Phase 1, ahead of the Phase 4 connector work? | **Decided 16 Nov:** yes, as a throwaway proof like Phase 0. The spec's roadmap is updated |
| 32 | Full data export: what format? | **Decided 17 Nov:** one file a spreadsheet can open per kind of record, in a zip, plus one complete file for moving to another tool. The spec is updated |
| 33 | Weekly email: is it sent in a week with no sessions? What does the partner see? | **No longer applies.** Decided 16 Nov: the summary is read by the coach through `get_weekly_summary`. The emailed summary and accountability partner are deferred |
| 34 | If someone loses access to their email, or every device holding their passkey, there is no self-service way back into the account | **Decided 16 Nov:** an admin resets the account and sends ready-to-paste reset instructions from their own email |
| 35 | Should the app send any email at all? Sign-in is the only remaining reason for an email service and domain (Decisions, row H) | **Decided 16 Nov:** passkey sign-in first, no email sent by the app. Tested in the early proof. If it fails, sign in by emailed link and code, with an email service |
| 36 | Backups on the free Supabase plan. As I understand it, the free plan keeps no automatic backups, so a mistake or a fault could lose history | **Decided 17 Nov:** start on the free plan. Before friends join, either move to the paid plan or add a scheduled backup. Each user's own export button is available from Phase 5. The spec's roadmap is updated |
| 37 | What is the app's permanent web address? Passkeys and each friend's coach connection are tied to the address, so changing it later means everyone sets up again | **Decided 17 Nov:** use Vercel's free address for building and testing. Choose the permanent address before the first friend is invited. The spec's roadmap is updated |
| 38 | May an admin remove another person's account, and does the 14-day grace period apply? | **Decided 16 and 17 Nov:** admins can create, delete, deactivate, reactivate and reset accounts (16 Nov). An admin's delete keeps the 14-day grace period, during which an admin can undo it (17 Nov). The spec is updated |
| 39 | New, 17 Nov. A superset's design is always even (question 10), but two things can still make it uneven during a live session: switching one member's set to a warm-up adds a set for that member only (spec Section 2), and the user can skip one member's remaining sets. What happens then? | **Decided 17 Nov: does not apply.** Nathan: sets remain aligned with all exercises in a superset. Switching a set to a warm-up inside a superset is a paired effect: that round becomes a warm-up for every member, and each member gains one working set, so the budget grows by one round. Switching back undoes it for all members, if the added sets are not logged. The spec is updated. Still assumed, awaiting Nathan's confirmation: Skip inside a superset skips the whole superset's remaining rounds; one member can be swapped for another exercise but not skipped by itself. Finishing a workout part-way through a round can leave logged sets uneven. That is a record of what happened, not a plan |
| 40 | New rule from Nathan, 17 Nov: the spec never said how many exercises a superset can hold | **Decided 17 Nov:** two or three. A superset letter used by one item, or by four or more, is refused in the planner and returned to the coach as an error. The spec and the coach instructions are updated |
| 41 | New feature request from Nathan, 17 Nov: "sometimes equipment needed for a superset is blocked or utilized, need the ability to break a superset into individual exercises while preserving set / rep / weight as defined" | **Decided 17 Nov** (Nathan: "break all three, assumptions accepted"): during a workout, the user can break a superset into individual exercises, and each keeps its sets, reps and weight as defined. A break splits every member apart, including in a superset of three; pulling one out and keeping a pair is not offered. It is done on the phone during a session and applies to that session only; the library workout and the campaign are not changed. After the break each exercise has its own clock and its own budget (the single-exercise formula on its sets left), and rest follows every set, using that exercise's own rest. It can be done part-way through: sets already logged stay, and only the sets left are done individually. It can be undone until a set is logged after the break. The coach can propose the same break as a today-only change, with a new `break_superset` action in `propose_today_change`. It is reached from the superset label on the active workout screen and from the superset's rows in the tray, and is new, not in the prototype. **This design's own choices, not yet shown to Nathan:** (a) the shared clock's time so far stays with the superset and counts toward efficiency for the sets logged before the break; (b) the exercises keep the superset's place in the order, one after another, and can be reordered in the tray; (c) once broken, the paired warm-up and equal-sets rules no longer apply to them; (d) a coach's break accepted mid-session is applied inside that session without starting a new one, and one accepted before the session starts is held in today's prepared plan; (e) on undo, any time on the new exercises' clocks goes back to the superset's clock. The spec and the coach instructions are updated |

### C. Facts to confirm with a small test

I did not check these against current documentation in this sitting. Each is confirmed in Phase 1 before anything is built on it.

| Fact relied on | If it turns out false |
|---|---|
| Supabase's sign-in can act as the sign-in for the connector, and ChatGPT and Claude accept it | Use a sign-in company (WorkOS or Stytch), or a small sign-in server in the app |
| A coach pass can be told apart from an app sign-in inside the database, so the database can refuse coach writes | Enforce the same limit in one guarded module of the connector, with tests |
| Supabase's sign-in supports passkeys | Add them with a small standard library, or move passkeys to Phase 5 |
| Supabase's scheduler can run every few seconds | Use a delayed-message service (one more account), or accept alerts up to a minute late |
| Web Push reaches an iPhone home-screen app from iOS 16.4 | No fallback on the web. Rest alerts would be foreground only until the native app |
| Screen Wake Lock works in a home-screen app from iOS 18.4 | A known workaround, a silent looping video. Tested before use |
| A web app's sound can mix with music without interrupting it | The rest sound becomes optional and off by default |
| The home-screen app keeps its stored data indefinitely | The app warns when unsent sets exist and syncs more eagerly |
| The Vercel and Supabase free tiers fit this use | Paid tiers |
| A coach app's scheduled tasks can call a custom connector, so the weekly summary can arrive without being asked for | The user asks their coach for the week's summary by hand. Nathan plans a scheduled task on the LLM side, or his Dot agent, which he has shown can call the connector |
| A passkey can be the only sign-in method with Supabase, and works in the iPhone home-screen app and on the coach-connection page | Sign in by emailed code, which needs an email service and a domain |

### E. Phase 1 findings (17 November 2026)

Added during Phase 1 on Opus 5.5 at high effort. The sign-in proof's research was done by an Opus 5.5 high-effort helper, as `docs/MODEL_AND_EFFORT.md` asks for hard spots. Sources are listed in `proofs/connector-signin/README.md`.

**Proof result, 17 November 2026.** Nathan ran the proof. Passkey-only sign-in worked on the iPhone, in Safari and in the home-screen app, with no email sent. ChatGPT (web, a project, the iPhone app, the Codex and Dot agents) and Claude (web, a Project, the iPhone app) both connected through Supabase's OAuth server and read as coach passes. Disconnect stopped both at once. Still to check: that a coach pass renews itself the next day. The design's first choices stand: Supabase for app sign-in and coach sign-in, and passkeys with no email. The fallbacks in 10C are not needed. Details are in `proofs/connector-signin/README.md`.

What the research found, against the facts in 10C:

| Fact from 10C | What Phase 1 found |
|---|---|
| Supabase's sign-in can act as the sign-in for the connector | Yes, in beta: an OAuth 2.1 server with PKCE and dynamic client registration, and a consent page we host at `/oauth/consent`. Confirmed by the proof on 17 Nov, for ChatGPT and Claude |
| A coach pass can be told apart inside the database | Yes: a coach pass carries a `client_id` claim. The database rules use it in one function, `app.is_coach()` |
| Supabase's sign-in supports passkeys | Yes, natively, in beta. The app uses them, so it has no passkey table of its own and no extra passkey library |
| A passkey can be the only sign-in method | Yes, with one server step: a passkey can be added only to an existing, signed-in person, so opening an invite or reset link creates the sign-in record, signs the person in once with a one-time token that is never emailed, and then creates the passkey. Confirmed by the proof on 17 Nov, on the iPhone in Safari and in the home-screen app |

Points that differ from or add to this design. Each is recorded here for Nathan, not decided by the build:

1. Section 4 says the connector supports "both common ways" for a coach app to register itself. Supabase supports only one (dynamic client registration). Claude's connector setting must be "Register automatically".
2. Supabase does not name the connector in a coach pass's audience, as MCP asks. The connector makes up for it by accepting passes only from this Supabase project and checking each with Supabase on every call. Phase 4 keeps both checks.
3. "Disconnecting cancels the pass at once" holds only because of that per-call check. A pass checked locally would stay valid until it expires, about an hour. Confirmed by the proof on 17 Nov: with the per-call check, Disconnect stopped ChatGPT and Claude at once. Phase 4 keeps the per-call check.
4. The Supabase project needs the newer signing keys (ECC P-256), so the connector can check passes. This is a setup step in `docs/SETUP.md`.
5. A reset also removes the person's old passkeys, through Supabase's admin tools (`src/server/accounts.ts`). **Changed by Nathan on 17 Nov, after testing on his real account:** all of this happens when the admin makes the reset link, not when the link is opened, because a reset means the old sign-in can no longer be trusted. As a second lock, each profile records when its sign-ins were cut off, and the database refuses any pass issued before that moment, from the app or a coach (`supabase/migrations/20261117000400_reset_cuts_off_at_once.sql`). Nathan's retest found that the database cannot delete Supabase's long-lived renewal tokens, so a signed-in device fetched a fresh pass after the reset and got past that date check. So the server also blocks the account in Supabase's sign-in service from the moment the reset is made, the same block deactivation uses, and lifts it when the link is opened. While blocked, no device can fetch a fresh pass or sign in.
6. **For Nathan:** a passkey belongs to one web address. Question 37 chose the permanent address "before the first friend is invited". It needs choosing before Nathan makes his own real passkey, or his passkey and coach connection must be redone after the change. **Decided 17 Nov:** Nathan chose `https://chalkandiron-trantelica.vercel.app` as the permanent address, before making his real passkey.
7. Vercel's preview Deployment Protection blocks ChatGPT, Claude and passkeys, so it is off for the proof project.
8. Both Supabase features are in beta, and the passkey interface may change without notice. The fallbacks in 10C stand: a passkey library (SimpleWebAuthn) with the same one-time-token step, or a sign-in company.

Choices the build made within the design:

- Deactivating an account blocks it twice: the database shows it nothing (including its coach), and the server also blocks sign-in in Supabase.
- An invite or reset link carries its secret after "#", so opening the link never sends the secret to the server or its logs.
- The first admin is made by a one-time invite (`scripts/bootstrap-admin.mjs`) that works only while the app has no accounts.
- The tests run on a local in-memory Postgres with a small stand-in for Supabase's sign-in schema (`tests/db/`), because there is no Supabase project yet. The same migrations then run on the real project.

### D. Carried from the kickoff brief, still open

- Whether the Coach button can open ChatGPT inside a specific project.
- Whether Claude works as a coach through the same connector. **Answered 17 Nov by the sign-in proof: yes**, on the web, in a Project and in the iPhone app.
- Default work and rest seconds have no researched source.
- `docs/COACH_INSTRUCTIONS.md` is a parked draft.

---

## What happens next

1. Nathan answered every row of the decisions table on 16 November, and Section 10 on 17 November. Both sets of answers are recorded in this document, and the spec is updated wherever an answer changes a product rule.
2. Every earlier question in Section 10 is now answered. Only a few small details are still marked "awaiting Nathan's confirmation", each with a working assumption, so none blocks the design:
   - question 12: whether "the heaviest previous set" means last session's; whether a planned weight wins over the seed; an empty box the first time; reps pre-filled from the plan;
   - question 14: whether a workout's bodyweight volume shows as its own figure beside the pounds total;
   - question 39: whether Skip inside a superset skips the whole superset;
   - question 41, Nathan's request to break a superset during a workout: decided, including that a superset of three splits into all three. Five small details are this design's own choices, listed in that row, for Nathan to see when he reviews.
3. Nathan approved this design on 17 November 2026. Phase 1 begins in a new session on Opus 5.5 at high effort, on its own branch and pull request, starting with the small connector sign-in proof (question 31).
