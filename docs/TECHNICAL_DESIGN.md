# Chalk and Iron: technical design

16 November 2026 · Written for Nathan's review · Status: **proposed, not approved** · Revised the same day after Nathan's first answers

This is the plan for how Chalk and Iron gets built. It follows `docs/SPEC.md` and changes nothing in it. No app code is written until Nathan approves this document.

Written by Fable 5.2 on 16 November 2026, as `docs/MODEL_AND_EFFORT.md` sets out. Any later revision is done on Opus 5.5 at high effort.

**How to read it.** Each section opens with a short plain-language summary. The tables underneath are the detail the coding agent builds from. Nathan does not need to check every field. The parts that need his attention are the summaries, the "Decisions for Nathan" list just below, and Section 10.

**A caution about facts.** Several choices here rest on how Supabase, iPhones, ChatGPT and Claude behave today. I wrote those parts from what I know, and did not open and check each product's current documentation in this sitting. Each such point is marked "to confirm" and collected in Section 10C, with a fallback. None of them should be treated as proven until a small test in Phase 1 says so.

## Decisions for Nathan

These are the choices in this design that cost money, add an account, or change something the spec says. Everything else is engineering detail.

| # | Decision | What this design proposes | Nathan's answer, 16 Nov |
|---|---|---|---|
| A | Stack and hosting | One web app on Vercel, with Supabase for the database and sign-in. This is the spec's starting suggestion. Section 1 | Not yet answered |
| B | An email-sending service and a domain name | First draft: needed for sign-in emails and the weekly summary | **Changed.** The weekly summary is read by the coach through the connector and is not emailed. The emailed summary and the accountability partner are deferred to a later version. Invites are ready-to-paste text that the admin sends from their own email. That leaves sign-in as the only thing that might need email: see row H |
| C | Paid plans | First draft: paid Supabase plan before friends join | **Start on the free plan.** Nathan uses the app 4 to 6 times a week, so a pause is not a real risk. Backups are a separate point and stay open: question 36 |
| D | Sign-in on the iPhone home-screen app | An emailed link opens in Safari, which the iPhone treats as a different app from the home-screen app, so the link alone would not sign the app in. The email would carry a link **and** a six-digit code to type into the app. Section 4 | Explained again, awaiting an answer. Row H may remove the issue altogether |
| E | Who can register | An invite link | **Decided.** Single-use invite links. Only an admin can make them, on an admin page. A person who was invited cannot invite others unless made an admin. Section 4 |
| F | Rest alerts in the background | Sent by the server at the moment rest ends, using a scheduler inside Supabase. No third account. Section 7 | Not yet answered |
| G | The open questions | Section 10 lists places where the spec is unclear or disagrees with itself. Each has a stated assumption so the build can proceed, but they are yours to settle | To be reviewed next |
| H | New: should the app send any email at all? | Sign-in is now the only reason for an email service. Two routes. **Email code:** the well-trodden route, self-service recovery, needs an email service and a domain. **Passkey only** (Face ID or Touch ID, no email): no email service, and the Safari problem in row D disappears, but recovery goes through the admin and it depends on facts not yet confirmed. Recommended: try passkey-only in the early sign-in proof (question 31, approved). Use it if it passes, fall back to email code if it does not. Section 4 | New, awaiting an answer |

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
- Supabase: start on the free tier (Nathan's decision, 16 Nov). It pauses only a project left idle, which regular use rules out. As I understand it the free tier keeps no automatic backups, which is the open point in question 36.
- Email service: only if sign-in by emailed code is kept. Usually free at this volume, and it needs a domain name, a small yearly cost.
- Web address: the app needs one permanent address either way. Vercel gives a free one. See question 37.
- No secrets go in the repository. Keys live in Vercel's and Supabase's own settings.

---

## 2. Database schema

**In short:** every record carries its owner, and the database enforces that only the owner can see it. Library records (exercises, workouts, campaigns) are separate from history records (sessions and sets). A session copies its plan when it starts, so later edits to the library can never rewrite the past.

### Rules that apply to every table

- `id`: a random unique id (uuid). The phone can create ids while offline, which is what makes "appears exactly once" possible (Section 6).
- `user_id`: the owner. Required on every table. Row-level security allows access only where `user_id` matches the signed-in user.
- `created_at`, `updated_at`: timestamps, stored in universal time.
- `version`: on library and profile tables, a counter that goes up by one on every edit. Used to spot out-of-date proposals (Section 5).
- Weights: always a pounds column (`…_lb`, up to 3 decimals, so 27.5 kg stores as 60.627). Where the user typed the value, the typed value and unit are stored beside it.
- Nothing in the library is deleted. Exercises and workouts are archived with an `archived_at` date.
- Deleting an account removes every row that carries its `user_id`.

### Account and profile

**profiles** (the spec's User). One row per account.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Same id as the Supabase sign-in record |
| display_name | text | |
| totals_unit | 'lb' or 'kg' | Default 'lb' |
| time_zone | text | For example "America/Denver". Drives the 3:00 am day rollover and email timing |
| skin | 'chalk', 'arcade' or 'liquid' | Default 'chalk' |
| accent | text or empty | One of the seven accent names. Empty means the skin's own default |
| background | 'flat', 'steel' or 'board' | Used by the Chalk and Iron skin only |
| skins_available | list of text | The per-user gate from Section 6 of the spec. Default: all three |
| coach_link | text | The link the Coach button opens |
| is_admin | yes/no | Default no. An admin can open the admin page. It gives no access to anyone else's training data |
| setup_done | list of text | Which walkthrough steps are finished |
| delete_requested_at | timestamp or empty | Starts the 14-day grace period |

**coach_profiles**. One row per user: `goals`, `injuries_and_limits`, `weekly_schedule`, `notes` (all text), `version`.

**gyms**: `name`, `equipment` (list of text), `notes`, `is_default`, `archived_at`, `version`. The database allows only one default gym per user.

**invites**. One row per invite link. Only an admin can create one.

| Field | Type | Notes |
|---|---|---|
| code_hash | text | The link's secret is stored scrambled, so reading the database does not reveal a usable link |
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

### Library

**exercises**

| Field | Type | Notes |
|---|---|---|
| name | text | Unique per user among live exercises, ignoring capitals. Renaming changes only this field, so all history stays attached |
| muscle_group_id | link to vocabulary | Required |
| focus_id | link to vocabulary | Optional |
| equipment_id | link to vocabulary | Required |
| default_unit | 'lb', 'kg' or 'bw' | 'bw' is bodyweight. This is also the "remembered" unit from the phone's switch |
| work_seconds | number, 5 to 600 | Default 45 |
| rest_seconds | number, 0 to 600 | Default 120 or 90 (decision 3 in the spec) |
| note | text | The persistent one-line note |
| archived_at, version | | |

**exercise_alternates**. Three rows per exercise, one for each tier.

| Field | Type | Notes |
|---|---|---|
| exercise_id | link | |
| tier | 'bodyweight', 'basic_gym' or 'full_gym' | One of each per exercise |
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
| superset_letter | one letter or empty | |

Each item has its own permanent id. Day overrides attach to that id, not to "row 3", so reordering a workout never moves an override to the wrong exercise. This closes the prototype gap named in Section 5 of the spec.

**campaigns**

| Field | Type | Notes |
|---|---|---|
| name | text | |
| start_date | date | |
| week_count | number, 1 to 6 | |
| status | 'draft', 'active' or 'finished' | The database allows only one active campaign per user |
| version | | |

**campaign_shifts**. One row each time a campaign is pushed forward a week: `campaign_id`, `blank_week_starts_on` (the calendar week left empty), `made_by` ('user' or a proposal id). Days after the blank week fall one week later. Shifts do not count toward the six-week limit because they are stored apart from `week_count`.

**campaign_days**. One row per day that has a workout. A day with no row is a rest day.

| Field | Type | Notes |
|---|---|---|
| campaign_id | link | |
| week | number, 1 to 6 | Not above the campaign's week count |
| weekday | number, 1 to 7 | One row per campaign, week and weekday |
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

The database checks that the item belongs to the same workout the day uses, so an override can never point at a row from a different workout. Changing a day's workout removes that day's overrides, as the prototype does.

What a day actually plans is worked out when needed, never stored: the workout's current items, with that day's overrides on top. So an unperformed day always follows the current design, as Section 10 of the spec requires.

### History

**today_plans**. A prepared plan for one calendar day that is not the campaign's own. It exists for two cases: the planner's "send to phone as today's workout", and a coach's today-only proposal accepted before the session starts. Fields: `local_date`, `source` (campaign day or workout), `plan` (the full list of exercises as it should start), `made_by`. It is consumed when the session starts and never touches the library or the campaign.

**sessions**

| Field | Type | Notes |
|---|---|---|
| local_date | date | The day it belongs to, using the 3:00 am rollover in the time zone at the start |
| source_kind | 'campaign_day' or 'ad_hoc' | |
| campaign_day_id, workout_id | links or empty | Where the plan came from |
| workout_name | text | Copied at the start |
| gym_id | link or empty | |
| started_at, ended_at | timestamps | |
| status | 'active' or 'finished' | |
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
| time_budget_seconds | number | Worked out by the shared rules and kept current when sets are added or removed |
| clock_started_at | timestamp or empty | Empty until Start exercise |
| clock_banked_seconds, clock_running_since | | The exercise clock, same method as the workout clock |
| clock_stopped_at | timestamp or empty | Set when the last set is logged |

**session_exercises**. The snapshot of the plan at session start.

| Field | Type | Notes |
|---|---|---|
| session_id, block_id | links | |
| exercise_id | link | History follows this link, so a renamed exercise shows its new name |
| exercise_name_then | text | The name at the time, kept for the record |
| position_in_block | number | Order within a superset |
| planned_set_types | list | For example warm-up, working, working, working. Holds the warm-up switch on sets not yet logged |
| planned_reps | number | |
| planned_weight_lb, planned_weight_entered_value, planned_weight_entered_unit | or empty | |
| planned_rest_seconds, work_seconds | numbers | Copied at the start |
| state | 'open', 'done', 'skipped' or 'replaced' | |
| origin | 'plan', 'added', 'swap' or 'proposal' | |
| swapped_from_exercise_id | link or empty | |

**set_logs**. One row per logged set.

| Field | Type | Notes |
|---|---|---|
| session_exercise_id | link | |
| set_number | number | |
| weight_lb | number, 3 decimals | Canonical |
| entered_value, entered_unit | number, 'lb', 'kg' or 'bw' | Exactly what was typed |
| reps | number, 1 or more | |
| set_type | 'warm_up', 'working' or 'drop' | |
| rpe | number 1 to 10 or empty | |
| logged_at | timestamp | From the phone, at the moment of logging |
| record_types | list | Any of 'heaviest', '6_plus', '10_plus', '20_plus', 'most_reps' |
| deleted_at | timestamp or empty | A deleted set is kept as a marker so a late-arriving copy cannot bring it back |

Records are not a separate table. They are worked out from `set_logs` for an exercise, and worked out again whenever any set of that exercise is added, edited or deleted.

**cardio_logs**: `local_date`, `type`, `duration_seconds`, `distance`, `distance_unit`, `notes`.

### Coach

**proposals**

| Field | Type | Notes |
|---|---|---|
| source | text | Which coach app sent it, for example "ChatGPT" |
| kind | 'exercise', 'workout', 'campaign', 'today_change' or 'profile_update' | |
| applies_to | 'today', 'library', 'campaign' or 'profile' | Shown on the card |
| summary_lines | list of text | What the user reads |
| payload | structured data | The exact changes, already validated |
| status | 'pending', 'accepted', 'rejected', 'out_of_date' or 'expired' | See Section 5 |
| expires_at | timestamp or empty | Set for today proposals |
| created_at, decided_at | timestamps | |
| result | structured data or empty | What was created on Accept |

**proposal_targets**. One row per existing record a proposal would change: `proposal_id`, `record_kind`, `record_id`, `version_seen`. When the user edits a record, any pending proposal that targets it is marked out of date.

**connector_calls**. A short log of connector use: `client_name`, `tool`, `ok`, `called_at`. No content is stored. It powers the "connection test" on the Coach setup page and a "last used" line in settings.

### Housekeeping

- **rest_alerts**: `session_id`, `fire_at`, `status`. See Section 7.
- **received_changes**: the ids of changes already received from phones, so a repeat is ignored. See Section 6.
- **starter library**: about 40 exercises and the starter vocabulary live as a data file in the repository and are copied into each new account at registration.

---

## 3. Connector contracts

**In short:** the sixteen tool names in the spec are kept as they are, and one read tool is added, `get_weekly_summary` (Nathan's decision, 16 Nov). Twelve tools read and five propose. A propose tool can do exactly one thing: add a pending proposal. The database, not only the code, enforces that.

### Rules shared by every tool

- **Sign-in.** Every call must carry a valid sign-in for one user (Section 4). Without one, the connector answers "not signed in" and the coach app starts the sign-in.
- **Whose data.** The user comes from the sign-in, never from anything the coach sends. No tool accepts a user id.
- **Weights.** Returned as the value in the exercise's own unit, the unit, and pounds: `{ "value": 27.5, "unit": "kg", "lb": 60.627 }`. Accepted as a value with a unit.
- **Naming an exercise or workout.** A tool accepts either the id or the exact name.
- **Dates.** Calendar dates in the user's time zone, written `2026-11-16`.
- **Size.** List tools return at most 50 items unless noted, with a `next` marker for more.
- **Annotations.** Read tools: read-only yes, destructive no, repeat-safe yes, closed world. Propose tools: read-only no, destructive no, repeat-safe no, closed world. These are the same labels the Phase 0 test used when ChatGPT Pro was allowed to propose.

### Errors, in one shape

A failed call returns a plain sentence the coach can act on, a code, and where useful a list of problems.

| Code | Meaning | What comes back with it |
|---|---|---|
| not_signed_in | No valid sign-in | The coach app re-runs sign-in |
| not_found | The named exercise, workout, campaign, session or proposal does not exist for this user | What was asked for |
| invalid_input | A field is missing, the wrong type or out of range | Each problem with the field name |
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
| list_exercises | Optional: `muscle_group`, `equipment`, `search`, `include_archived`, `next` | Each exercise with every field: id, name, muscle group, focus, equipment, default unit, work seconds, rest seconds, note, the three alternates, archived flag | invalid_input |
| get_exercise_history | `exercise` (required). Optional: `from`, `to` (default the last 12 weeks), `limit` (default 20 sessions, most 100) | The exercise and its unit. Per session: date, workout name, each set (number, weight, reps, type, RPE, records), session volume, Skipped mark. Estimated one-rep max | not_found, invalid_input |
| get_records | Optional: `exercise`. Without it, all exercises | Per exercise: the four records, each with weight, reps and date. For a bodyweight exercise, most reps | not_found |
| list_workouts | Optional: `include_archived` | Each workout: id, name, archived flag, items in order (item id, exercise, sets, reps, rest and whether it is the exercise default, superset letter, time budget) | invalid_input |
| get_campaign | Optional: `campaign_id`. Without it, the active campaign | Name, status, start date, week count, end date, any shifts. Each day: date, workout, state (upcoming, done, missed or rest), overrides per item. Also a short list of draft campaigns by id and name | not_found. No active campaign is not an error: it returns none, with a sentence |
| get_today | None | Today's date. What is planned, with overrides applied and last session's numbers per exercise. Any missed workouts still available. The live session if one is running: elapsed time, efficiency, volume, current exercise, each exercise's logged sets and Skipped or Replaced marks. Pending today proposals | not_signed_in |
| list_sessions | Optional: `from`, `to`, `limit` (default 20), `next` | Per session: id, date, workout name, source, gym, duration, volume, efficiency, records set, and each exercise with its sets and Skipped marks | invalid_input |
| get_proposal_status | `proposal_id` | Status, kind, created and decided times | not_found |
| get_weekly_summary | Optional: `week_of` (any date in the week wanted). Without it, the most recent full week | The week's dates. Sessions done and planned days missed. For each session: the exercises with sets, reps and weights. Total volume, records set, efficiency. Cardio entries for the week | invalid_input |

**The weekly summary goes through the coach.** The app cannot push anything to the user's LLM, because the app never calls an LLM (rule 1). So the summary is a read tool: the user asks their coach for the week, or sets their coach app to ask on a schedule, and the coach writes it up. For an accountability partner, the coach writes a version to share and the user sends it themselves. Whether a coach app's scheduled tasks can use a custom connector is not confirmed (Section 10C).

`get_campaign` gains one optional input the spec does not list, `campaign_id`, so a coach can read a draft it is asked to edit. With no input it behaves exactly as the spec describes.

### Propose tools

Every propose tool:

- requires `summary_lines`: 1 to 20 plain lines, each up to 300 characters, one per change;
- validates everything first and returns errors to the coach if anything fails;
- on success creates one pending proposal and nothing else;
- returns `proposal_id`, `status: "pending"`, what it applies to, an expiry time if it has one, and a sentence telling the coach to tell the user it is waiting in the app.

| Tool | Inputs besides summary_lines | Checks | Errors |
|---|---|---|---|
| propose_exercise | `exercise` (id or name) to edit one, or leave out for a new one. Fields: `name`, `muscle_group`, `focus`, `equipment`, `default_unit`, `work_seconds`, `rest_seconds`, `note`, `alternates` (bodyweight, basic gym, full gym). A new exercise needs all of them except focus and note | Vocabulary values exist. Name is not a near-duplicate. Seconds are in range | not_found, invalid_input, unknown_vocabulary, near_duplicate_name |
| propose_workout | `workout` to edit, or leave out for new. `name`. `items` in order: `exercise`, `sets`, `reps`, optional `rest_seconds`, optional `superset` letter | Every exercise exists and is not archived. Numbers in range. A superset letter is used by at least two rows | not_found, invalid_input |
| propose_campaign | `campaign_id` to edit, or leave out for new. `name`, `start_date`, `week_count`. `days`: week, weekday, a workout or rest, and optional overrides per item (exercise, sets, reps, weight, rest). Or `shift_forward_weeks: 1` on its own | 1 to 6 weeks. Every workout and exercise exists. Each override names an item of that day's workout | not_found, invalid_input |
| propose_today_change | `changes`, each with an `action` (swap, set_sets, set_reps, set_weight, set_rest, add, remove, reorder), the exercise it applies to, and the new value | There is a workout today or a live session. Exercises exist. It does not touch a set already logged | nothing_to_change, not_found, invalid_input |
| propose_profile_update | Any of `goals`, `injuries_and_limits`, `weekly_schedule`, `notes`. And or a `gym`: id to edit or none for new, `name`, `equipment`, `notes`, `make_default` | At least one change is present | not_found, invalid_input |

A today proposal expires at the end of the day. A propose call repeated word for word within a minute returns the first proposal, so a coach app that retries does not fill the inbox with copies.

### What the connector may not do

- It never calls out to any LLM or any other service. It only answers.
- A coach sign-in can read the user's rows and add rows to `proposals` and `proposal_targets`. The database refuses every other write from a coach sign-in. Even a mistake in the connector's code cannot change a workout.
- Applying a proposal happens only when the signed-in user taps Accept in the app.

---

## 4. Sign-in

**In short:** you sign in to the app with your email, no password. Your coach app signs in to the connector by sending you to a Chalk and Iron page where you approve it once. Each person's data is fenced off by the database itself.

### Signing in to the app

1. The user types their email. The app sends an email holding a sign-in link and a six-digit code.
2. In a desktop browser the link signs them in. In the iPhone home-screen app they type the code.
3. After the first sign-in the app offers a passkey (Face ID or Touch ID), so later sign-ins need no email.
4. The sign-in stays active on that device until the user signs out.

Why the code: on an iPhone, a link tapped in Mail opens in Safari. Safari and the home-screen app do not share sign-ins, so the link would sign in the wrong place. A typed code works inside the home-screen app. This adds to confirmed decision 4 in the spec and needs Nathan's approval (Decisions, row D).

- **Recovery** is the same email flow. There is no password to forget.
- **Sign-out** ends the sign-in on that device and clears what the app stored on it, after sending anything still unsent.
- **Deleting an account** offers an export, marks the account, and a daily job removes everything 14 days later. Signing in during those 14 days offers to cancel.
- **Passkeys** are to confirm: if Supabase's sign-in does not support them directly, they are added with a small standard library or moved to a later phase.
- **Registration** is by single-use invite link from an admin. See "Invites and the admin page" below.

### Invites and the admin page

Decided by Nathan on 16 November.

- **Admins.** An account is either an ordinary user or an admin. Nathan's account is made the first admin once, when the app is set up. An admin can make another user an admin. An ordinary user cannot invite anyone.
- **Invite links are single-use.** Each link registers one account and then stops working. It also stops after 7 days if unused, and an admin can cancel it at any time.
- **Ready-to-paste invite.** Making an invite shows a block of text holding the link and the setup steps (register, add to the home screen, allow notifications, connect a coach). The admin copies it into their own email or message. The app sends nothing.
- **The admin page** shows: the list of accounts (name, email, date joined), invites (waiting, used, expired, cancelled), and buttons to make or cancel an invite, make someone an admin, and help someone who is locked out.
- **What an admin cannot do.** An admin sees no one else's workouts, history, notes, coach profile or proposals. The rule that each user sees only their own data has no admin exception. The admin page reads account details only.

### Sign-in without any email (option, Decisions row H)

With the weekly email deferred and invites pasted by hand, sign-in is the only thing left that needs an email service. It could be dropped too:

1. A friend opens their invite link, types a name and email address (kept as a contact detail only), and creates a passkey with Face ID or Touch ID.
2. From then on, signing in is one Face ID or Touch ID check. Apple keeps the passkey in iCloud Keychain, so it is available in Safari and in the home-screen app alike, and on the person's other Apple devices. The Safari problem in row D does not arise.
3. On a computer without the passkey, the sign-in page shows a code to scan with the phone.
4. If someone loses every device, an admin makes them a single-use recovery link from the admin page.

What it depends on, none of it confirmed yet: that Supabase's sign-in can use a passkey as the only sign-in method, that passkeys work inside the iPhone home-screen app, and that they work on the page ChatGPT and Claude open when connecting a coach. The early sign-in proof tests all three. If any fails, the design falls back to the emailed code above.

### Signing the coach in to the connector

Both ChatGPT and Claude connect to a custom connector the same way, using the standard sign-in method the MCP protocol requires (OAuth 2.1).

1. The user pastes the connector link into their coach app.
2. The coach app calls the link, is told "sign in first", and is pointed to Chalk and Iron's sign-in.
3. The coach app opens a Chalk and Iron page in the browser. The user signs in with their email if needed, and sees one plain question: "Allow ChatGPT to read your training data and send you proposals?"
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

The all-powerful database key is used only by background jobs (emails, alerts, clean-up), kept in one small module, and never by anything that handles a user's request.

---

## 5. Lifecycles

**In short:** a session, a proposal and a campaign each move through a few named states. These tables say what is allowed in each, following Section 10 of the spec.

### Session

| State | How it starts | Allowed | Not allowed |
|---|---|---|---|
| Planned (no session yet) | A campaign day, a missed day, a sent day or any library workout | Start it. Pull it to another day. A today proposal can change the plan | |
| Active | Start is tapped. The plan is copied into the session at that moment | Start exercise, log, undo, edit or delete sets, switch warm-up, skip, reorder, add, swap, navigate, finish (always available, confirms if sets remain) | Changing the library by any of the above |
| Finished, within 48 hours | Finish workout, or 30 minutes with no activity (end time is the last logged entry) | Reopen: clocks resume and the closed time is not counted. Edit or delete sets from History | |
| Finished, after 48 hours | Time passes | Edit or delete sets from History. Records are recalculated | Reopening. Restarting clocks |

Also:

- A session belongs to the day it started, by the 3:00 am rule. It keeps running across 3:00 am.
- Sets left undone when a session finishes are marked Skipped and left out of efficiency. An exercise never started is Skipped.
- If a today proposal is accepted mid-session: the session finishes with reason "replaced" and becomes an ad hoc session holding the work done. Its unreached sets are marked Replaced and left out of efficiency. A new session starts from the proposed workout.
- Editing a workout or exercise never changes any session, active or finished.

### Proposal

| State | Meaning | What can happen next |
|---|---|---|
| Pending | Waiting in the inbox | Accept, Decline, become out of date, expire |
| Accepted | Applied in full | Final |
| Rejected | Declined or dismissed. Nothing changed | Final |
| Out of date | The user edited something it would change. Cannot be accepted | Dismiss. Final |
| Expired | A today proposal that passed the end of its day | Final |

- **Accept** is one all-or-nothing step in the database. First it re-checks that every record the proposal targets is unchanged since it was made. If that fails, the proposal becomes out of date and nothing is applied.
- Accept and Decline need a connection, because the server applies them.
- A proposal never blocks anything. The user can edit freely while one is pending.
- The coach sees every state through `get_proposal_status`.
- What each kind applies to: exercise and workout proposals change the library. Campaign proposals change a campaign. Today proposals change only the live session or today's prepared plan. Profile proposals change the coach profile or a gym.

### Campaign

| State | Allowed | How it leaves |
|---|---|---|
| Draft | Edit everything. Copy. Any number can wait as drafts | The user activates it |
| Active | Edit days and overrides at any time. Shift forward a week. Days become done or missed as time passes. Only one at a time | Its last day passes, or the user ends it |
| Finished | Read. Copy into a new draft. Its sessions stay in History | Final |

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
| Library edits made on the phone offline (a note, a unit switch) and the same exercise edited in the planner | The last change to reach the server wins, field by field |

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
| Workout clock | Session start | Finish. Resumes on reopen with the closed time left out |
| Exercise clock, one per block | Start exercise | When the last set of the exercise or superset is logged |
| Rest timer | After a set, or after the last member of a superset round | Stored as the moment rest ends. +0:15 moves that moment. Skip clears it |

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
- `extras` holds three values the prototype uses that the spec's list does not name: text color on a selected button, display font weight, and whether headings are in capitals. See question 27.
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
- The layout's positions and sizes are written once, apart from the tokens, and never refer to a skin. Text sits in boxes of fixed height, so a skin with a larger heading size cannot push anything else.
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

All automated tests run on every pull request. A phase is not offered for acceptance until they pass.

### Each acceptance test

| Spec group | Test | Layer |
|---|---|---|
| Units and entry | 27.5 kg stores 60.627 lb and shows 27.5 kg | Rules, App |
| | Switching lb to kg turns 60 lb into 27.22 kg, history then in kg | Rules, App |
| | Weight steps of 5, reps steps of 1 | Rules, App |
| | Weight not below 0, reps not below 1 | Rules, Database |
| Supersets and rest | First member moves to second with no rest | Rules, App |
| | Second member starts rest and returns to first | Rules, App |
| | +0:15 adds 15 seconds, Skip ends rest | Rules, App |
| | Banner and sound at zero | App, with a controlled clock. The sound is checked as "asked to play" |
| | Background notification at rest end | **Device**. The server side (alert scheduled, sent, cancelled on Skip) is automated |
| Time budget, dial, efficiency | Superset budget 11:40. Single budget 7:30 | Rules |
| | Clock does not run before Start exercise | Rules, App |
| | Fill at half, full, one and a half, double and 3.2 times the budget | Rules |
| | 83% efficiency example | Rules |
| Records | All five record tests | Rules, then Database for recalculation after an edit or delete |
| Graph | Three equal bars labeled 8, 8, 7. Volume point 1,380 lb | Rules for the numbers, App for the drawing |
| Library never changed by use | Override on Monday week 3 leaves the rest at 8 | Database |
| | Swap leaves the library workout unchanged | Database, App |
| | Rename keeps history and records | Database |
| | Editing a workout does not change a past session | Database |
| Coach | A propose call creates one pending proposal and nothing else | Connector, comparing the whole database before and after |
| | Accept applies all, Decline none | Database |
| | Status readable after either | Connector |
| | Today proposal leaves library, campaign and logged sets alone | Database |
| | Outside-vocabulary value is an error and never reaches the inbox | Connector |
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

- The emailed code signs in inside the home-screen app.
- The rest sound plays without stopping music from another app.
- The notification permission prompt appears only after the app is on the home screen.
- The connector sign-in completes from the ChatGPT iPhone app and the Claude iPhone app.
- A session survives the phone being locked for ten minutes mid-rest.

The three platform facts in Section 7 of the spec (notifications from iOS 16.4, server-sent rest alerts, wake lock from iOS 18.4) are confirmed on a real iPhone in Phase 1, as the spec asks.

---

## 10. Open questions

These are places where the spec is unclear, silent or disagrees with itself. They are listed, not resolved. Each has the assumption this design makes so that work is not blocked. Nathan's answer replaces the assumption.

### A. The spec disagrees with itself

| # | Question | Where | Assumed until decided |
|---|---|---|---|
| 1 | Who may register? "Nathan and a small group of friends" on a public web address, with self-service registration and no stated way to keep strangers out | Sections 2 and 10 | **Decided 16 Nov:** single-use invite links, made only by an admin on an admin page. The spec is updated |
| 2 | Converted weights: Section 8 expects 60 lb to show as 27.22 kg (two decimals). Section 10 says converted weights show to one decimal (27.2). The prototype rounds to the nearest half | Sections 8 and 10 | One decimal for display, as the later rule says. The acceptance test would need changing to 27.2 |
| 3 | "The library is never changed by use", yet the phone's unit switch and note line change the exercise during a workout | Sections 1, 2 and 5 | Those two are deliberate edits by the user, not changes "by use", and are allowed |
| 4 | Proposal states: Section 3 lists pending, accepted, rejected. Section 10 adds out of date, and today proposals expire. Section 4 says `get_proposal_status` returns one of three | Sections 3, 4 and 10 | Five states, all visible to the coach |
| 5 | "Decline discards it" and "any proposal can be dismissed at any time". Are Decline and Dismiss the same thing? | Sections 4 and 10 | Yes. Both end as rejected |
| 6 | Sign-in by emailed link does not work inside the iPhone home-screen app | Section 9, decision 4 | The email carries a link and a six-digit code. Awaiting Nathan's answer, together with question 35 |
| 7 | Skins must not resize elements, yet heading size and numeral size are tokens that differ by skin | Sections 1 and 6 | Text sizes may differ. Boxes keep fixed sizes, so nothing moves |
| 8 | Section 9 opens with "seven points are not yet decided" and "rows 4 and 6 to 10 are confirmed", but the table has fourteen rows | Section 9 | No effect on the build. Worth tidying in the spec |

### B. The spec does not say

| # | Question | Assumed until decided |
|---|---|---|
| 9 | Does the exercise clock keep running when the user moves to another exercise and comes back? The spec says it never stops while the exercise is "open". The prototype pauses it when you leave | It runs from Start exercise until the last set is logged, whichever exercise is on screen |
| 10 | Superset budget when members have different set counts. The spec's formula assumes equal rounds | The prototype's method: each member's sets times its work seconds, plus rest between rounds of the longest member |
| 11 | Which rest applies to the solo rounds at the end of an uneven superset: the remaining member's, or the first member's? | The remaining member's own rest |
| 12 | Planned weight when a day has no weight override. A workout item has no weight field | The heaviest set from that exercise's last session, as the prototype does. Blank if there is no history |
| 13 | How is a drop set marked, and where is RPE entered? Neither is in the prototype | A long press on a set row opens set details: type and RPE |
| 14 | Bodyweight exercises: what counts as volume, and how are bars drawn? | Volume is total reps and bars show reps, as the prototype does. They are left out of workout volume in pounds |
| 15 | Can a bodyweight exercise carry added weight (a weighted pull-up)? | No. It would be a separate exercise with a weight unit |
| 16 | A swap to an alternate not yet in the library: what muscle group, equipment and unit does the new exercise get? Only a name is stored | It copies the original's muscle group, focus, work and rest. The user is asked for equipment and unit once |
| 17 | Records and ties, and records within one session. Does a second set today that beats the first set today count? | A record must strictly beat the best before that set, including earlier sets today. A tie is not a record |
| 18 | Estimated one-rep max "taken from the best set". Best by what measure, and over what period? | The set with the highest estimate, over all history, working and drop sets only |
| 19 | Must a campaign start on a Monday? Which day starts the week? | Weeks run Monday to Sunday. A campaign may start on any date, and week 1 is the week holding that date |
| 20 | "Send to phone as today's workout" when the campaign already has a workout today. Does it replace it or sit beside it? | It sits beside it. Home shows both |
| 21 | When a proposed campaign is accepted, does it become active? What if another is active? | It arrives as a draft. The user activates it. Activating one ends the current one after a confirmation |
| 22 | Can a workout or campaign proposal include brand-new exercises, or must each be proposed and accepted first? "Unknown exercises" are errors | They must exist first. This means two rounds of approval for a plan with new exercises |
| 23 | Does the app require three alternates on a coach-proposed exercise, or is that only advice in the coach instructions? | Required for a new exercise from a coach. Optional when the user adds one by hand |
| 24 | When does a today proposal expire: midnight, or the 3:00 am rollover? | The 3:00 am rollover, to match how days work everywhere else |
| 25 | Is gym equipment free text, or picked from the equipment vocabulary? | A free list. Gyms have things the vocabulary does not, such as a rower |
| 26 | Removing or renaming a vocabulary value that exercises use | Renaming carries through to every exercise. A value in use is archived, not deleted |
| 27 | The prototype uses three style values the spec's token list does not name: text on a selected button, display font weight, and heading capitals | Added as "extras" in each skin file |
| 28 | Who writes the starter library of about 40 exercises with alternates, and the starter work and rest seconds? | The coding agent drafts the list in Phase 1 for Nathan to edit |
| 29 | The coach cannot see cardio, and cannot list its own past proposals. Neither has a tool | Not built. Raised in case Nathan wants a `list_cardio` or `list_proposals` tool |
| 30 | Can a user have two sessions active at once, for example on two devices? | No. Starting a second offers to resume or finish the first |
| 31 | May a small sign-in proof for the connector be done at the start of Phase 1, ahead of the Phase 4 connector work? | **Decided 16 Nov:** yes, as a throwaway proof like Phase 0. The spec's roadmap is updated |
| 32 | Full data export: what format? | One file a spreadsheet can open per kind of record, in a zip, plus one complete file for moving to another tool |
| 33 | Weekly email: is it sent in a week with no sessions? What does the partner see? | **No longer applies.** Decided 16 Nov: the summary is read by the coach through `get_weekly_summary`. The emailed summary and accountability partner are deferred |
| 34 | If someone loses access to their email, or every device holding their passkey, there is no self-service way back into the account | An admin helps from the admin page, with a single-use recovery link or a change of email |
| 35 | Should the app send any email at all? Sign-in is the only remaining reason for an email service and domain (Decisions, row H) | Try passkey-only sign-in in the early proof. Use it if it passes. Otherwise sign in by emailed code, with an email service |
| 36 | Backups on the free Supabase plan. As I understand it, the free plan keeps no automatic backups, so a mistake or a fault could lose history | Start on the free plan. Before friends join, either move to the paid plan or add a scheduled backup. Each user's own export button is available from Phase 5 |
| 37 | What is the app's permanent web address? Passkeys and each friend's coach connection are tied to the address, so changing it later means everyone sets up again | Use Vercel's free address for building and testing. Choose the permanent address before the first friend is invited |
| 38 | May an admin remove another person's account, and does the 14-day grace period apply? | An admin can block sign-in at once. Removal follows the same 14-day grace period as a self-service delete |

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
| A coach app's scheduled tasks can call a custom connector, so the weekly summary can arrive without being asked for | The user asks their coach for the week's summary by hand |
| A passkey can be the only sign-in method with Supabase, and works in the iPhone home-screen app and on the coach-connection page | Sign in by emailed code, which needs an email service and a domain |

### D. Carried from the kickoff brief, still open

- Whether the Coach button can open ChatGPT inside a specific project.
- Whether Claude works as a coach through the same connector.
- Default work and rest seconds have no researched source.
- `docs/COACH_INSTRUCTIONS.md` is a parked draft.

---

## What happens next

1. Nathan answered five of the decisions on 16 November, and they are recorded in the table at the top. Still to answer: rows A, D, F and H, and Section 10.
2. The document is revised to match his answers, and the spec is updated where an answer changes it.
3. Once Nathan approves, Phase 1 begins on Opus 5.5 at high effort, on its own branch and pull request.
