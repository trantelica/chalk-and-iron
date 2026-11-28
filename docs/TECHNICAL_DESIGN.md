# Chalk and Iron: technical design

16 November 2026 · Written for Nate's review · Status: **approved 17 November 2026** · Revised twice on 16 November after Nate's answers to the decisions table, and twice on 17 November after his answers to Section 10

**Approved by Nate on 17 November 2026.** Every row of the decisions table and every question in Section 10 is answered. The few details then still marked "awaiting Nate's confirmation" (questions 12, 14 and 39) and this design's own choices for question 41 stand as written unless Nate changes them later. They are now marked "accepted with the design's approval on 17 Nov" (wording brought up to date on 17 Nov, after the Phase 1 review). On approval Nate also narrowed one rule: only a proposal that replaces today's workout with a different one splits a running session (Section 5). Phase 1 may now begin.

This is the plan for how Chalk and Iron gets built. It follows `docs/SPEC.md`. Where Nate's answers change a product rule, the spec has been updated to match. Nate approved it on 17 November 2026, so Phase 1 may begin.

Written by Fable 5.2 on 16 November 2026, as `docs/MODEL_AND_EFFORT.md` sets out. Any later revision is done on Opus 5.5 at high effort.

Both revisions of 17 November 2026 were done on Opus 5.5 at high effort. Section 10E, added during Phase 1 on 17 November 2026, records what the Phase 1 sign-in research found. On 24 November 2026 (Opus 5.5) Nate's Phase 4 decisions were added: the coach intake on the coach profile, an optional decline reason, the campaign's last-week note on Home, and weekly check-in marks; with them, what the connector tells the coach (Section 3), the coach behaviour evals (Section 9) and the Phase 4 stages (Section 11). On 25 November 2026 (Opus 5.5, high) stage 4A settled how the coach eval data is loaded (Section 9) and how the call log is written (Section 2), and stage 4B recorded how the connector is built (Section 3).

**Status is not kept here.** What is being built now is in `docs/NEXT.md`, and what was done and decided, by date, is in `docs/LOG.md`. This document keeps the design, its findings and Nate's decisions about it.

**How to read it.** Each section opens with a short plain-language summary. The tables underneath are the detail the coding agent builds from. Nate does not need to check every field. The parts that need his attention are the summaries, the "Decisions for Nate" list just below, and Section 10.

**A caution about facts.** Several choices here rest on how Supabase, iPhones, ChatGPT and Claude behave today. I wrote those parts from what I know, and did not open and check each product's current documentation in this sitting. Each such point is marked "to confirm" and collected in Section 10C, with a fallback. None of them should be treated as proven until a small test in Phase 1 says so.

## Decisions for Nate

These are the choices in this design that cost money, add an account, or change something the spec says. Everything else is engineering detail.

| # | Decision | What this design proposes | Nate's answer (16 Nov unless marked) |
|---|---|---|---|
| A | Stack and hosting | One web app on Vercel, with Supabase for the database and sign-in. This is the spec's starting suggestion. Section 1 | **Approved** |
| B | An email-sending service and a domain name | First draft: needed for sign-in emails and the weekly summary | **Changed.** The weekly summary is read by the coach through the connector and is not emailed. The emailed summary and the accountability partner are deferred to a later version. Invites are ready-to-paste text that the admin sends from their own email. That leaves sign-in as the only thing that might need email: see row H |
| C | Paid plans | First draft: paid Supabase plan before friends join | **Start on the free plan.** Nate uses the app 4 to 6 times a week, so a pause is not a real risk. Backups were settled separately on 17 Nov (question 36): before friends join, move to the paid plan or add a scheduled backup |
| D | Sign-in on the iPhone home-screen app | An emailed link opens in Safari, which the iPhone treats as a different app from the home-screen app, so the link alone would not sign the app in. The email would carry a link **and** a six-digit code to type into the app. Section 4 | **Agreed**, as the fallback route. Row H makes passkey sign-in the first choice, which avoids the issue |
| E | Who can register | An invite link | **Decided.** Single-use invite links. Only an admin can make them, on an admin page. A person who was invited cannot invite others unless made an admin. Admins can create, delete, deactivate, reactivate and reset accounts. Section 4 |
| F | Rest alerts in the background | Sent by the server at the moment rest ends, using a scheduler inside Supabase. No third account. Section 7 | **Approved.** It is still confirmed on a real iPhone in Phase 1, as Section 10C lists |
| G | The open questions | Section 10 lists places where the spec is unclear or disagrees with itself. Each has a stated assumption so the build can proceed, but they are yours to settle | **Answered 17 Nov**, every question, and recorded in Section 10. The small details of questions 12 and 14 and the skip rule in question 39 were accepted with the design's approval on 17 Nov. Your request to break a superset is decided (question 41), and the details that are this design's own choices were accepted with the design's approval on 17 Nov too |
| H | New: should the app send any email at all? | Sign-in is now the only reason for an email service. Two routes. **Email code:** the well-trodden route, self-service recovery, needs an email service and a domain. **Passkey only** (Face ID or Touch ID, no email): no email service, and the Safari problem in row D disappears, but recovery goes through the admin and it depends on facts not yet confirmed. Recommended: try passkey-only in the early sign-in proof (question 31, approved). Use it if it passes, fall back to email code if it does not. Section 4 | **Decided.** Passkey sign-in first, and the app sends no email. A lost sign-in is reset by an admin, who gets ready-to-paste reset instructions to send from their own email. If the passkey test fails, fall back to the emailed link and code, with a passkey still offered |

---

## 1. Stack and hosting

**In short:** one codebase, hosted on Vercel, holding the phone app, the planner and the connector. Supabase holds the data and handles sign-in. Two accounts Nate already has. An email-sending service is added only if sign-in by emailed code is kept (Decisions, row H).

### Recommended

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for the phone app, planner, connector and rules. Catches a large class of mistakes before anything runs |
| Web framework | Next.js on Vercel | The most widely used pairing with Vercel and Supabase, so it is the best documented and the easiest for any future coding agent to pick up |
| Shape | One project with three doors: `/app` (phone), `/planner` (desktop), `/mcp` (connector) | One deployment, one set of rules, one place for sign-in. Nothing to keep in step |
| Database | Supabase Postgres | Nate has the account. A real relational database suits this data, which is all relationships (campaign, day, workout, item, override) |
| Sign-in | Supabase Auth | Email sign-in is built in. To confirm: passkeys and the connector sign-in (Section 4) |
| Per-user isolation | Postgres row-level security | The database itself refuses to hand one user's rows to another. See Section 4 |
| Scheduled work | Supabase's built-in scheduler (pg_cron) | Rest alerts, session auto-finish, proposal expiry, account deletion. Keeps everything inside the two accounts |
| Email | Only if sign-in by emailed code is kept: Resend (suggested), connected to Supabase Auth | Supabase's own email sender is rate-limited and meant for testing only. Needs a domain name to send from. The app sends no other email: the weekly summary goes through the coach, and invites are pasted into the admin's own email |
| Notifications | Standard Web Push, sent from the server | The only route to a home-screen web app on iPhone |
| Storage on the phone | The browser's built-in database (IndexedDB), through the small Dexie library. **As built in Phase 2 (18 Nov), this design's own choice:** the browser's simpler built-in storage (localStorage), with no extra library | Holds the active session and a queue of unsent changes. Section 6. localStorage writes the session and the outbox in the same instant as the tap, which is exactly "one step", and the amounts are small (one session, one queue). IndexedDB stays the fallback if the phone ever needs to hold more |
| Connector | The official MCP software kit for TypeScript, running at `/mcp` | Same protocol Phase 0 proved. Reuses the ideas of Phase 0, not its code (the test itself was removed in stage 4B) |
| Shared rules | One module of pure functions: units, time budget, efficiency, records, day rollover | The same code runs on the phone (instant, offline) and on the server (authoritative). The acceptance tests in Section 8 of the spec test this module directly |
| Styling | Plain CSS driven by CSS variables generated from theme token files | Makes "no hard-coded colors or fonts" checkable by a machine. Section 8 |
| Fonts | Bundled with the app, not loaded from Google at run time | Works offline and makes no outside calls. All five fonts are open-licensed |

### Considered and dismissed

| Option | Why not |
|---|---|
| A native iPhone app now | Out of scope. The spec places it after the web version |
| A separate always-on server (for example on Fly or Render) | It would make timers easy, but it is a third thing to run, pay for and watch. The scheduler inside Supabase covers the need |
| Firebase | Not a relational database, and Nate already has Supabase |
| SvelteKit or Remix in place of Next.js | Both would work. Next.js has the most guides and examples for Vercel with Supabase, which matters when an AI agent is the builder |
| A ready-made sync service (PowerSync, ElectricSQL, Replicache) | Powerful, but another service and another account. This app's offline need is narrow: one phone, one active session, a queue of sets. A small outbox does it (Section 6) |
| Supabase Edge Functions for the connector | A second runtime and a second place for code. Keeping the connector in the main app means one set of rules |
| Tailwind or a component library | They invite colors and sizes written straight into the page, which rule 7 forbids |
| A third-party sign-in company (WorkOS, Stytch, Clerk) | Kept as the fallback if Supabase cannot do the connector sign-in. Not the first choice because it is another account and splits sign-in across two places |

### Costs and accounts to expect

- Vercel: the free tier is likely enough to start.
- Supabase: start on the free tier (Nate's decision, 16 Nov). It pauses only a project left idle, which regular use rules out. As I understand it the free tier keeps no automatic backups. Decided 17 Nov (question 36): before the first friend joins, either move to the paid plan or add a scheduled backup.
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
- Weights: always a pounds column (`…_lb`, up to 3 decimals, so 27.5 kg stores as 60.627). Where the user typed the value, the typed value and unit are stored beside it. A weight shown in the unit it was typed in shows exactly as typed. A converted weight shows to one decimal, so 60 lb shows as 27.2 kg (decided 17 Nov, question 2). If the user switches the entry box from lb to kg and logs the converted 27.2 kg without changing it, the set keeps the original 60 lb rather than 27.2 kg converted back, so a unit switch alone never changes a weight (confirmed by Nate, 17 Nov). The same holds for a seeded weight (question 12): logged untouched, it keeps the exact pounds value it was seeded from, whatever unit the box shows.
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
| is_eval_account | yes/no | Default no. At most one account, the coach eval account (Section 9), marked by hand in the SQL Editor. Nobody can set it from the app |

**coach_profiles**. One row per user: `goals`, `injuries_and_limits`, `weekly_schedule`, `notes`, `version`, and the coach intake (added 24 Nov; spec Section 4, "Coach intake"; every field may be empty):

| Field | Type |
|---|---|
| coach_style | 'supportive', 'challenging' or 'neutral' |
| experience | 'new', 'returning', 'intermediate', 'experienced' or 'all_in' |
| priorities | Up to three, in rank order. Each is one of 'strength', 'muscle', 'fat_loss', 'general_fitness', 'endurance', 'mobility', 'sport', 'habit', or 'other' with its own text (up to 100 characters). No value twice except 'other' (with different wording). Stored as a list such as `[{"value": "strength"}, {"value": "other", "text": "Rock climbing"}]`; the database refuses any other shape |
| progression_pace | 'steady', 'moderate' or 'aggressive' |
| workout_minutes | 10 to 240 |
| days_per_week | 1 to 7 |
| variety | 'familiar', 'some' or 'lots' |
| exercises_liked, exercises_to_avoid, how_to_coach_me | text, up to 2,000 characters each |

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
| assisted | yes/no | Added at the start of Phase 2 (decided 17 Nov, Section 10E point 9). Yes for an assisted machine: the logged number is assistance, so less is better. Not allowed on a bodyweight exercise |
| load_count | 1, 2 or 4 | Added at the start of Phase 2 (decided 17 Nov). How many times the logged weight is moved per rep: 2 for a pair of dumbbells or a one-sided lift logged per side, 4 for both. Used only for volume. Default 1 |
| created_via | 'starter', 'planner', 'swap' or 'proposal' | How the exercise joined the library. The database allows an empty muscle group or equipment only when this is 'swap' |
| archived_at, version | | |

**Exercises made by a swap** (decided 17 Nov, question 16). A swap to an alternate that is not yet in the library creates the new exercise at once, so the session never waits. The phone then shows a simple one-tap confirm of suggested details: muscle group, focus, work and rest seconds copied from the original; the unit is bodyweight for the bodyweight tier, otherwise the original's unit; equipment is suggested where it can be (bodyweight for the bodyweight tier, otherwise left for the user). If the user does not confirm, the exercise still joins the library with what is known from the original, and anything not known, usually equipment, stays empty. A swap-made exercise starts with no alternates, and that does not make it incomplete (confirmed by Nate, 17 Nov).

An exercise is **incomplete** when its muscle group or equipment is empty. This is worked out, not stored. The planner shows an "Incomplete" flag on it and highlights the empty fields, and `list_exercises` tells the coach. The flag never blocks anything: an incomplete exercise can be logged, swapped to, put in workouts and used in campaigns like any other. A coach's proposed new exercise is never incomplete, because `propose_exercise` requires every field, and so does a new exercise bundled into a workout or campaign proposal.

**exercise_display_units** (decided 17 Nov, question 3). The phone's lb/kg switch for each exercise, kept apart from the library.

| Field | Type | Notes |
|---|---|---|
| exercise_id | link | One row per user and exercise |
| unit | 'lb' or 'kg' | The unit the phone last showed for this exercise |

- With no row, the phone uses the exercise's `default_unit`.
- If the default unit is later changed in the planner, the phone's remembered choice stays as it is (confirmed by Nate, 17 Nov).
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
- A superset has two or three exercises (Nate's rule, 17 Nov). A letter used by one item, or by four or more, is refused.
- Every member has the same number of sets. Reps can differ.
- The user's own changes keep members in step. In the planner, changing one member's sets changes them all, in a workout and in a day override. An exercise that joins a superset takes the superset's set count (confirmed by Nate, 17 Nov).
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

The database checks that the item belongs to the same workout the day uses, so an override can never point at a row from a different workout. Changing a day's workout removes that day's overrides, as the prototype does. In the planner, a sets override on one member of a superset is applied to every member of that superset on that day, so the day's superset stays even. **Saving a workout** (review at high effort, 23 Nov, migration `…20261123000100`): the Workouts screen saves its rows through one database step, `save_workout(p_workout, p_items, p_removed, p_day_sets)`, with the person's own access. It writes the rows, any day overrides needed so each campaign day's supersets stay even, and the removals together, so the superset checks run once everything is written and nothing is kept if one fails. An exercise joining a superset takes its set count on every day as in the workout: the count the members already there have on that day, or, for a new superset, that of the row that started it (`daySetsForSupersets`, `src/rules/planner.ts`). Before this, a day that overrode a row's sets made the save refused.

What a day actually plans is worked out when needed, never stored: the workout's current items, with that day's overrides on top. So an unperformed day always follows the current design, as Section 10 of the spec requires.

### History

**today_plans**. A prepared plan for one calendar day that is not the campaign's own. It exists for two cases: a day sent from the planner with "send to phone as today's workout", and a today-only proposal accepted before the session starts. Fields: `local_date`, `source` (campaign day or workout), `plan` (the full list of exercises as it should start), `made_by` ('user' or a proposal id). It is consumed when the session starts and never touches the library or the campaign. **The `plan` format** (this build's own choice, 19 Nov, since nothing writes one before the planner and the coach): a list of `{ exercise_id, sets, reps, rest_seconds?, superset_letter?, weight_lb? }`. A session started from it names it (`today_plan_id` with the session), and the account marks it used.

**Sending a day from the planner** (decided 17 Nov, question 20). If today already has a workout, the sent day does not replace it straight away. It arrives in the inbox as a proposal with source 'planner': a card saying what would replace what, with Accept and Dismiss. Accept makes it today's workout, for today only, through `today_plans`. It changes neither the library nor the campaign. Dismiss changes nothing. If a session is already running when it is accepted, the existing rule for accepting a today proposal mid-session applies unchanged (Section 5). When today has no workout planned, a sent day becomes today's workout straight away, with no card (confirmed by Nate, 17 Nov). After Accept, the campaign's own day for today is left as it was. If it is not done, it shows as Missed like any other day, and the user can remove it from the campaign if they do not mean to do it (accepted by Nate, 17 Nov).

**Deciding a sent day** (built 20 Nov, Phase 3, migration `supabase/migrations/20261120000100_decide_planner_proposal.sql`). The planner adds the card itself, under the person's own sign-in; a coach sign-in cannot add one with source 'planner'. The card is decided through one guarded database step, `decide_planner_proposal(p_proposal, p_accept)`, called from the planner as `supabase.rpc('decide_planner_proposal', { p_proposal, p_accept })`. It acts only for the person signed in with the app (a coach pass is refused), and only on their own card with source 'planner'. Its answer is `{ ok, status, code?, message, today_plan_id?, replaced_session_id? }`; a card that is not theirs, already decided, out of date, expired or that breaks a rule gets `ok: false` with a `code` (`not_found`, `not_planner`, `already_decided`, `out_of_date`, `expired`, `invalid`) and a plain message, and nothing is applied. A second decision on the same card is answered `already_decided` with its status and changes nothing. A card past its 3:00 am expiry is marked expired. Before Accept it checks the plan: every exercise is the person's own and not archived; 1 to 12 sets, 1 to 50 reps, 0 to 600 seconds of rest; every superset letter used by two or three exercises with the same sets. Accept adds a `today_plans` row for the card's day (`made_by` 'proposal:' and the card's id; `plan` is `{ items, name }`, which `src/rules/today.ts` reads, so a day with no library workout keeps the name sent), records it in the card's `result`, and changes no exercise, workout, campaign, campaign day or override. Dismiss marks the card rejected and changes nothing else. The card's shape (`payload`): `local_date`, `workout_name`, `workout_id`, `campaign_day_id`, `plan_items` (as the `plan` format above) and `replaces` (text for the card). This design's own choice: it runs as the database with every row named by owner, rather than with row-level security, because a person may not change a proposal directly (otherwise a card could be marked accepted without being applied).

**sessions**

| Field | Type | Notes |
|---|---|---|
| local_date | date | The day it belongs to, using the 3:00 am rollover in the time zone at the start |
| source_kind | 'campaign_day' or 'ad_hoc' | The value `ad_hoc` stays as it is in the database. On screen and in the documents the kind is an "ad-hoc workout" (formerly "Quick workout"), one kind of "off-plan workout" (Nate, 27 Nov); the data was not changed |
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
| break_undo | structured data or empty | Added in Phase 2 (18 Nov): what "Undo break" restores, while it is still allowed (question 41) |
| plan_revision | whole number, from 0 | Added in stage 4D (26 Nov): how many accepted coach's changes to today the running workout's plan includes. A phone's copy with a lower number never overwrites the plan (Section 5, "Accepting a change to today") |

`clock_banked_seconds` is kept to the thousandth of a second, as the phone keeps it (changed in Phase 2, 18 Nov). The same holds for `session_blocks`.

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
| members_at_break, sets_done_at_break, sets_planned_at_break | list of links, numbers, or empty | Added in Phase 2 (18 Nov), on a broken superset only: who was in it, and how many of its sets were done and planned at the break, which efficiency counts |

**Breaking a superset** (decided 17 Nov, question 41). During a workout the user can break a superset into individual exercises, and each keeps its sets, reps and weight as defined. Every member is split apart, including in a superset of three. How the data handles it (the points marked "own choice" are this design's, accepted with the design's approval on 17 Nov):
- Each member moves to a new single block of its own. Own choice: the new blocks take the superset's place in the order, one after another, in member order. The new blocks have empty superset letters and point back through `broken_from_block_id`.
- Each new block's budget is the single-exercise formula on the sets that member still has to do: sets left × work seconds + (sets left − 1) × that member's own planned rest. Its clock is fresh and starts at Start exercise.
- If the superset was not started yet, nothing else happens: each member simply has all its sets in its own block, and the old block is left with no time and no sets, and is neither shown nor counted.
- Own choice: if the superset was started, the old block is closed at the break. Its clock stops and keeps the time it ran. Each member's `sets_before_break` records how many sets it had logged. For efficiency the old block counts like any started exercise: its time allocated is its budget × the sets logged before the break ÷ all the sets it planned. Sets left are not marked Skipped, because they move to the new blocks.
- Undo restores the superset as it was, with its clock resuming from its banked time, as long as no set has been logged since the break. After a set is logged, the break stays for that session. Own choice: any time on the new blocks' clocks is added back to the superset's clock on undo. Undo changes back only that superset and the blocks its break made; every other exercise keeps what happened to it since, and one added since stays (Phase 2 review, 20 Nov).

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

**The seeded weight** (decided 17 Nov, question 12). When the plan sets no weight, the weight box for set N is pre-filled with the weight of set N from the last session in which this exercise was done. If that session had no set N, it is pre-filled with the heaviest set from that session. Sets are counted in order, whatever their type. Tapping into the box clears it, ready for a new number. Logging without touching it commits the seeded value, keeping its exact pounds value. Accepted with the design's approval on 17 Nov: (a) "the heaviest previous set" means the heaviest set of that last session, not of today's; (b) a weight set by a campaign day override or an accepted proposal wins over the seed; (c) the very first time an exercise is done, the box is empty; (d) reps are pre-filled from the planned reps, as now. A bodyweight exercise has no weight box to seed: every set is 1 BW.

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

- **Ties** (decided 17 Nov, question 17). A record must strictly beat the best before that set, including earlier sets the same day. A tie is not a record and gets no celebration or badge. But when a set ties the best, the record moves to that most recent set: it shows that set's reps and date, so the weight, reps and date shown all come from one set (confirmed by Nate, 17 Nov).
- **Estimated one-rep max** (decided 17 Nov, question 18): the highest estimate from any working or drop set, over all history. None for an assisted exercise.
- **Assisted exercises** (decided 17 Nov, Section 10E point 9): each record is the least assistance for that many reps or more, and a new record must use strictly less. This design's own choice: when the seeded weight falls back to "the heaviest set" of last session, an assisted exercise uses the set with the least assistance instead.

**Volume.** Volume is weight × reps × the exercise's `load_count` over working and drop sets, so it is the total weight moved. Dumbbells are logged and recorded per single dumbbell; only volume uses the load count (decided 17 Nov). An assisted exercise's volume is its total reps, in BW units. Band exercises are bodyweight exercises (`default_unit` 'bw'), because band resistance is not standardized (decided 17 Nov). A bodyweight set counts as 1 BW, so its volume is 1 × reps, counted in BW units and kept apart from pounds totals (decided 17 Nov, question 14). For a bodyweight exercise, total reps plays the part that volume plays for a weighted one, everywhere: in the exercise's stats, in what the coach reads, and as the graph's volume line. Its graph bars are all the same height (1 BW), with the reps on top. Accepted with the design's approval on 17 Nov: a workout's summary shows bodyweight volume as its own figure beside the pounds total, for example "8,450 lb · 60 BW", rather than adding the two together.

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
| decline_reason | text or empty | An optional line, up to 300 characters, the user may give when declining a coach's card (Nate, 24 Nov). The coach reads it through `get_proposal_status` and `list_proposals` |
| result | structured data or empty | What was created on Accept, including the ids of any bundled new exercises and workouts |

**proposal_targets**. One row per existing record a proposal would change: `proposal_id`, `record_kind`, `record_id`, `version_seen`. When the user edits a record, any pending proposal that targets it is marked out of date. The phone's lb/kg switch is not an edit to the exercise, so it never does this.

**connector_calls**. A short log of connector use: `client_name`, `tool`, `ok`, `called_at`. No content is stored. It powers the "connection test" on the Coach setup page and a "last used" line in settings. From stage 4A it is written only through one guarded step, `record_connector_call`, which takes a coach's pass only, appends a row for the signed-in person stamped with the time now, and clears that person's rows older than 30 days.

**weekly_checkins** (added 24 Nov). One row per user and week: `week_start` (a Monday) and `first_read_at`. Added the first time a coach reads that week's summary through `get_weekly_summary`, at any time, through the guarded step `record_weekly_checkin` (Section 3), which takes a coach's pass only, any date in the week, and refuses a week that has not started. It is kept as long as the account, unlike the short call log. Home marks those weeks, and "check-ins in a row" counts back from the most recent full week, unbroken.

### Housekeeping

- **admin_actions**: who did what to which account, and when. Written for every admin action. Holds no training data.
- **rest_alerts**: `session_id`, `fire_at`, `status`, and from Phase 2 `handed_at`, `sent_at` and `result`. A person may schedule and cancel their own alerts; only the server marks one sent. See Section 7.
- **received_changes**: the ids of changes already received from phones, so a repeat is ignored, with the kind of change and whether it was applied or refused (and why). From Phase 2 an id is unique per person, not across everyone, and a person can read and add only their own. See Section 6.
- **starter library**: the starter exercises with their three alternates and starter work and rest seconds, and the starter vocabulary, live as a data file in the repository (`data/starter-library.json`) and are copied into each new account at registration. Drafting the list is a Phase 1 build task, and Nate reviews it (decided 17 Nov, question 28). **Version 2, approved 17 Nov:** 227 exercises from an outside coach's review. Accounts made with version 1 are brought up to version 2 by a migration (Section 10E, point 9).

---

## 3. Connector contracts

**In short:** the sixteen tool names the spec started with are kept as they are, and three read tools are added: `get_weekly_summary` (Nate's decision, 16 Nov), and `list_cardio` and `list_proposals` (17 Nov, question 29). Nineteen tools in all: fourteen read and five propose. A propose tool can do exactly one thing: add a pending proposal. The database, not only the code, enforces that.

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
| get_profile | None | Display name, goals, injuries and limits, weekly schedule, notes, the coach intake (coach style, experience, priorities in rank order, progression pace, workout minutes, days per week, variety, exercises liked, exercises to avoid, how to coach me), totals unit, time zone, today's date, default gym (id and name) | not_signed_in |
| list_gyms | None | Each gym: id, name, equipment list, notes, default flag | not_signed_in |
| get_vocabulary | None | Muscle groups, each with its focus values. Equipment values. Allowed units and set types | not_signed_in |
| list_exercises | Optional: `muscle_group`, `equipment`, `search`, `include_archived`, `next` | Each exercise with every field: id, name, muscle group, focus, equipment, default unit, work seconds, rest seconds, note, the alternates, archived flag, and an incomplete flag naming any empty fields (question 16) | invalid_input |
| get_exercise_history | `exercise` (required). Optional: `from`, `to` (default the last 12 weeks), `limit` (default 20 sessions, most 100) | The exercise and its unit. Per session: date, workout name, each set (number, weight, reps, type, RPE, records), session volume, Skipped mark. Estimated one-rep max | not_found, invalid_input |
| get_records | Optional: `exercise`. Without it, all exercises | Per exercise: the four records, each with weight, reps and date. For a bodyweight exercise, most reps. A tie moves the record to the newer set, so its reps and date are the latest | not_found |
| list_workouts | Optional: `include_archived` | Each workout: id, name, archived flag, items in order (item id, exercise, sets, reps, rest and whether it is the exercise default, superset letter, time budget) | invalid_input |
| get_campaign | Optional: `campaign_id`. Without it, the active campaign | Name, status, start date, week count, end date, any shifts. Each day: date, workout, state (upcoming, done, missed or rest), overrides per item. Also a short list of draft campaigns by id and name | not_found. No active campaign is not an error: it returns none, with a sentence |
| get_today | None | Today's date. What is planned, with overrides applied and last session's numbers per exercise. Any missed workouts still available. The live session if one is running: elapsed time, efficiency, volume, current exercise, each exercise's logged sets and Skipped or Replaced marks. Pending today proposals | not_signed_in |
| list_sessions | Optional: `from`, `to`, `limit` (default 20), `next` | Per session: id, date, workout name, source, gym, duration, volume, efficiency, records set, and each exercise with its sets and Skipped marks | invalid_input |
| get_proposal_status | `proposal_id` | Status (pending, accepted, rejected, out of date or expired), kind, created and decided times, and the decline reason if the user gave one | not_found |
| list_proposals | Optional: `status` (any of the five), `kind`, `from`, `to`, `limit` (default 20, most 100), `next` | Newest first. Per proposal: id, source (which coach app, or the planner), kind, what it applies to, summary lines, status, created, decided and expiry times, decline reason | invalid_input |
| list_cardio | Optional: `from`, `to` (default the last 12 weeks), `limit` (default 20, most 100), `next` | Newest first. Per entry: id, date, type, duration, distance and its unit, notes | invalid_input |
| get_weekly_summary | Optional: `week_of` (any date in the week wanted). Without it, the most recent full week | The week's dates. Sessions done and planned days missed. For each session: the exercises with sets, reps and weights. Total volume, records set, efficiency. Cardio entries for the week. Check-ins in a row, counted before this read is recorded | invalid_input |

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
| propose_profile_update | Any of `goals`, `injuries_and_limits`, `weekly_schedule`, `notes`, and the intake fields (`coach_style`, `experience`, `priorities`, `progression_pace`, `workout_minutes`, `days_per_week`, `variety`, `exercises_liked`, `exercises_to_avoid`, `how_to_coach_me`), each checked against its allowed values. And or a `gym`: id to edit or none for new, `name`, `add_equipment`, `remove_equipment` (single free-text items, not the whole list), `notes`, `make_default` | At least one change is present. Items: 1 to 60 characters, no repeats ignoring capitals, an add must not already be in the gym, a remove must be in it, the list stays within 500 | not_found, invalid_input |

**Bundled proposals** (decided 17 Nov, question 22). A workout or campaign proposal can bring its own new exercises (and, for a campaign, new workouts) in the same proposal, so a plan with new movements needs only one approval. One card lists everything, new exercises first, and one Accept applies all of it or none. "Unknown exercise" as an error now means not in the library and not defined in the same proposal. A today proposal cannot bundle new exercises; a swap or an add today names an exercise already in the library.

**Breaking a superset through the coach** (decided 17 Nov, question 41). A coach can propose `break_superset` as a today-only change, for example when the user says a machine is taken. How it is applied is this design's own choice: accepted during a live session, it breaks the superset inside that session, exactly as the phone's own Break superset does. It does not end the session or start a new one, unlike a today proposal that replaces the workout. Accepted before the session starts, it is held in today's prepared plan (`today_plans`), which simply lists the members as individual exercises. `get_today`, `list_sessions`, `get_weekly_summary` and History show the exercises as they were actually done, with a note that they were broken out of a superset.

A today proposal expires at the 3:00 am day rollover that ends its day (decided 17 Nov, question 24). A new campaign from an accepted proposal arrives as a draft, and the user activates it (question 21). A propose call repeated word for word within a minute returns the first proposal, so a coach app that retries does not fill the inbox with copies.

### What the connector tells the coach (24 Nov)

The coach behaviour brief (spec Section 4) reaches the coach in three places the connector controls, so every user's coach gets it without pasting anything:

- **The connector's own instructions:** the short text MCP lets a connector give a coach app when it connects. It carries the brief in a few lines: you can only propose and nothing changes until the user accepts in the app; read before proposing; one request, one proposal; say it is waiting in the app; ask when unsure; take the tone and pace from `get_profile`. Whether ChatGPT and Claude pass this text to their model is to be confirmed (Section 10C); the tool descriptions carry the same rules either way.
- **Each tool's description:** what it returns, plus the brief's rules that apply at that moment. `get_profile`: read it first, and the intake's coach style, pace and "how to coach me" set how to work. `get_weekly_summary`: the check-in (brief 3) and the pace check (brief 5). `list_proposals` and `get_proposal_status`: what to do after a decline (brief 4). Every propose tool: one line per change, bundle related changes, nothing changes until the user accepts, tell the user it is waiting. `propose_today_change`: propose straight away, today only. `propose_workout` and `propose_campaign`: ask first, bundle new exercises and workouts. `propose_profile_update`: the intake by conversation, and a pace change after a pace check.
- **Error messages:** written to the coach, saying what is wrong and how to fix it, for example "A superset holds two or three exercises. Split these four into two supersets, or make one a single exercise."

The descriptions live in one file in the connector, beside a list of the brief items each tool must carry. A code check fails a pull request when a description leaves out an item assigned to it, as the existing check does for the coach instructions and the tool list.

### How the connector is built (stage 4B, 25 Nov 2026)

- **The link** is `https://chalkandiron.vercel.app/mcp`, inside the app (`src/app/mcp/route.ts`, code in `src/server/connector/`). It uses the official MCP software kit without sessions: every request carries its own pass and gets a plain JSON answer, which suits Vercel's servers. Only POST is taken; there is no server-sent stream.
- **Sign-in on every call** (`auth.ts`, `token.ts`), carried from the Phase 1 proof. No pass: 401 with a pointer to `/.well-known/oauth-protected-resource`, which names Supabase's sign-in service. A pass is checked here (readable, issued by this project, not expired, a signed-in person, and its signature when the project signs with its public keys), then Supabase is asked whether the sign-in still exists, and the database whether the account is active. Supabase is asked at `/auth/v1/oauth/userinfo`, the endpoint it means coach passes to use: its sign-in update of November 2026 refuses coach passes on most of `/user` (the proof's check), and says `/user` will refuse them entirely soon. `/user` is asked only if `/oauth/userinfo` is missing. So a Disconnect, a reset or a deactivation stops the coach at once. **Only a coach's pass is accepted**: a pass from the app's own sign-in is refused at the connector, so every call is a coach's and is logged.
- **The approval page** is `/oauth/consent` in the app: sign in with the passkey if needed, then "Allow ChatGPT to read your training data and send you proposals?", Allow or Deny. It cannot be shown inside another page.
- **Errors.** A tool's error comes back as a tool result marked as an error, with the sentence in its text and `{ "error": { "code", "message", "problems"? , "retry_after_seconds"? } }` beside it, in the codes above. `not_signed_in` is the HTTP 401 itself, so the coach app re-runs sign-in. A tool name that does not exist is a protocol error. An input a tool does not take is `invalid_input`, so a coach cannot pass a user id.
- **Size limits.** A request of at most 256 KB and 20 messages. List tools return at most 50 items with a `next` marker; `list_gyms` takes an optional `next` for this, the one input it gains.
- **Too many requests.** At most 60 tool calls a minute and 600 an hour per person, across all their coach apps, counted from the call log. A refused call is not logged, so a coach app that keeps retrying gets through again as soon as its earlier calls age out.
- **The call log.** Every tool call is logged through `record_connector_call` with the coach app's name and whether it worked. The name is the one the app registered with Supabase ("ChatGPT", "Claude"). The same Supabase update stopped a coach's pass reading the person's list of connected apps, so a read-only database step, `my_coach_app()` (migration `…20261125000200`), answers a coach's pass with its own app's name and nothing else, and answers the app's own sign-in with nothing. "Coach app" if no name comes back, and never "planner". The same name becomes a proposal's `source` (stage 4E).
- **The one-minute repeat guard** (`repeat.ts`). A propose call's tool name and inputs, in a fixed order, make a fingerprint stored in `proposals.request_hash`. The same fingerprint from the same person within 60 seconds returns the first proposal and adds nothing. Stage 4E's propose tools add every proposal through `addProposal`. The proposal and its targets are still added as two steps (see "How the propose tools are built").
- **What the connector tells the coach** is in `descriptions.ts`: the instructions and each tool's description, each beside the brief items it must carry, checked by `tests/connector/descriptions.test.ts`. `get_profile` also returns `intake_unanswered`, the intake answers still empty, so a coach knows when to run the intake (brief 6).

### How the read tools are built (stage 4C, 25 Nov 2026)

- **Files.** `tools-library.ts` (exercises, workouts, campaign), `tools-history.ts` (exercise history, records, sessions, cardio), `tools-today.ts` (today, proposals, weekly summary), with shared pieces in `read.ts` and `sessions.ts`. Sessions are read through `loadSessionDetails` in the planner's History code and summed by `summarizeSession`, so numbers match History.
- **Whole lists.** The database stops at a thousand rows, so lists are read a thousand at a time, and lists of ids in pieces of 40.
- **Choices the build made within the design.** A pending proposal past its expiry reads as `expired`. A draft campaign has no missed days. `get_campaign` days run for every date of the campaign, rest days included. A superset's time budget is on its first member in `list_workouts`. `get_records` and `list_exercises` page with `next`. `get_weekly_summary`'s efficiency is the average of the week's sessions' own figures. If recording the check-in fails, the summary is still returned and says it was not recorded.
- **Check-ins in a row** (`src/rules/checkins.ts`) counts weeks back, unbroken, from the most recent full week; Home uses the same rule in stage 4H.

### How the propose tools are built (stage 4E, 27 Nov 2026)

- **Files.** `tools-propose.ts` holds the five tools; `propose.ts` the shared checks (vocabulary, near-duplicate names, new exercises, supersets, weights); `repeat.ts` adds the card (`addProposal`); each tool's text is in `descriptions.ts`.
- **Order of checks.** The input shape first (unknown inputs, ranges, missing summary lines), then names turned into ids (`not_found`), vocabulary (`unknown_vocabulary`, with the allowed values), near-duplicate names (`near_duplicate_name`, with the existing exercise), then the rules. Problems found together come back together as one `invalid_input` so the coach fixes them in one go; nothing is added when any is found.
- **Names.** Exercises, workouts and gyms are named by id or exact name. A brand-new exercise or workout in the same proposal is named by its own name (its `ref` on the card); a name already in the library cannot also be new, since a near-duplicate is refused.
- **Weights** are given as `{ value, unit }` and stored in pounds, with what was typed kept when it was kilograms. Above 2000 lb is refused.
- **Targets.** An edit of an exercise, workout, campaign or gym, and any profile field, stores the record and its version seen. A person with no coach profile yet gets no profile target (Accept would read a missing one as out of date).
- **Today's change** is checked against the running workout if there is one, otherwise today's plan, working through the changes in order so a later one can rely on an earlier one. With neither, `nothing_to_change`. It refuses a change to an exercise already done, a `set_sets` below the sets already logged, and a superset's sets changed on one member only unless the same proposal breaks it first. Its end time is set by the database (the next 3:00 am), not by the connector.
- **This design's own choices in stage 4E** (for Nate to confirm): a campaign override names its row by the exercise it holds (with `row` when the workout holds it twice) and may carry `swap_to`; a new campaign must list at least one day; a gym's equipment was first sent as a whole list of vocabulary values (replaced on 27 Nov, see "A gym's equipment is changed one item at a time"); a coach can clear a profile choice by sending null.
- **A gym's equipment is changed one item at a time** (27 Nov, Nate's approval; migration `20261127000100_gym_equipment_add_remove.sql`). `propose_profile_update`'s `gym` takes `add_equipment` and `remove_equipment` (up to 500 free-text items each, trimmed, 1 to 60 characters, no repeats ignoring capitals) and no longer takes a whole `equipment` list: replacing a list could drop items, since a gym can hold 500 and the coach reads and writes in pieces. This design's own choices: the whole-list field is removed from the tool (an old card that carries one is still applied); equipment is free text, not vocabulary (question 25); the propose tool refuses an add that is already in the gym, a remove that is not, an item both added and removed, a repeat, and a list that would pass 500; a new gym is filled with `add_equipment`. Accept (`app.accept_profile`, with `app.gym_equipment_after`) applies the adds and removes to the gym's list **as it is at Accept**, so an item added since the card was made is kept; the result is tidied, A to Z (by letters, ignoring capitals) and checked again (an empty or over-60 item, a list over 500, or a gym since removed refuses the whole card, nothing applied). A card that only adds or removes equipment (or only makes the gym the default, which a stale view cannot get wrong) has no target on the gym, so editing the gym does not make it out of date; a card that also changes the gym's name or notes keeps the gym target. A card that touches none of the equipment fields leaves the list exactly as it is (follow-up migration `20261127000200_gym_equipment_tidy.sql`, which also closes `app.gym_equipment_after` to direct calls like the other Accept helpers). The database keeps the list in a plain A to Z; the gym screen and `list_gyms` show it in the app's own order (`sortEquipment`: numbers in order, accents with their letter). A coach that still sends the old whole `equipment` list is told to use `add_equipment` and `remove_equipment`. The summary lines are the coach's own, described in the tool as, for example, "Add Rower and Sandbag to Big Gym".
- **Still open: the card and its targets are two steps.** `addProposal` tries the second step twice. A card left with no targets would not be marked out of date when the user edits what it changes. Closing it needs one guarded database step and one SQL step from Nate, so it is left for Nate's decision (`docs/NEXT.md`, Open items).

### How Coach setup, Profile and gyms are built (stage 4G, 27 Nov 2026)

- **No database change.** Every read and write uses the person's own access: the intake saves to their `coach_profiles` row (the database holds the allowed choices), the coach link to `profiles.coach_link`, gyms to `gyms` (archived, never deleted), and the connection test reads their own `connector_calls` rows (a call that worked and arrived after the test began). Connected coach apps are the person's own grants in Supabase's sign-in service (`auth.oauth.listGrants`, `revokeGrant`); revoking one cancels its pass at once, which the connector's per-call check honours.
- **Files.** Pages `src/app/planner/(shell)/coach-setup` and `.../profile`; components `coach-intake-form.tsx`, `coach-connection.tsx`, `gym-editor.tsx`, `copy-button.tsx`; rules `src/rules/coach-intake.ts` and `gym-equipment.ts`; the instructions text `src/lib/coach-instructions.ts` (a test fails if it differs from the block in `docs/COACH_INSTRUCTIONS.md`). The two pages open without waiting for the planner's library to load.
- **Gym equipment** stays free text, kept A to Z with no blanks or repeats (ignoring capitals), items up to 60 characters and up to 500 per gym. A "fully equipped" setting is not built (Nate, 27 Nov); it would be one more field on a gym beside the list, which would then hold the exceptions.
- **The coach link** is kept only if it is an https address, and the phone opens it only if it is one.
- **The guide, instead of copy-and-paste** (27 Nov, Nate: copying messages out of the app is unnecessary). `src/lib/coach-guide.ts` holds the one list of example phrases (five groups, each with its "what happens next" line), the instructions version and the fixed reply to "check setup". The component `src/components/coach-guide.tsx` (collapsible groups, then the Open my coach link) is shown on the phone's Coach screen and at the end of Coach setup; Home's last-week note uses its `OpenCoachLink`. The coach instructions carry the same examples. Coach setup is now seven steps: intake, connect, instructions (with two notes), check your setup, coach link, connection test, let's get started. Raise `COACH_INSTRUCTIONS_VERSION` whenever the instructions change. Ask my coach (the clipboard flow, 27 Nov earlier) is removed. No database change.
- **Screenshots** for the ChatGPT and Claude steps are marked placeholders until Nate supplies them (files go in `public/coach-setup/`).

### What each proposal carries, and how it is decided (stage 4D, 26 Nov 2026)

Stage 4E's propose tools check a coach's request and store it in this shape in `proposals.payload`, with exercises, workouts, vocabulary values and gyms named by id (the tools turn names into ids), weights in pounds, and the records it would change in `proposal_targets` with the version seen. Stage 4D applies it. Every field is optional unless said.

| Kind | Payload |
|---|---|
| exercise | `exercise_id` to edit one, or none for a new one. Then any of `name`, `muscle_group_id`, `focus_id`, `equipment_id`, `default_unit`, `work_seconds`, `rest_seconds`, `note`, and `alternates` (`{ bodyweight, basic_gym, full_gym }`, each a name). An edit changes only the fields given; a new muscle group without a focus empties the focus |
| workout | `workout_id` to edit, or none for new (then `name` and `items` are needed). `items` in order: `exercise_id` or `new_exercise` (the `ref` of one in `new_exercises`), `sets`, `reps`, `rest_seconds`, `superset_letter`. `new_exercises`: each shaped as a new exercise above, plus a `ref`. An edit with `items` sets the whole list |
| campaign | `campaign_id` to edit, or none for new (then `name`, `start_date`, `week_count` and `days`). `days`: `week`, `weekday` (1 is Monday), then `workout_id`, `new_workout` (a `ref` in `new_workouts`) or `rest: true`, and `overrides`: `item` (the row's place in that day's workout, from 0), `exercise_id` or `new_exercise`, `sets`, `reps`, `weight_lb` (with `weight_entered_value` and `weight_entered_unit` if the coach gave kilograms), `rest_seconds`. Or `shift_forward_weeks: 1`. `new_exercises`, and `new_workouts` (`ref`, `name`, `items`) |
| today_change | `local_date`, and `changes` in order, each an `action`: `swap` (`exercise_id`, `to_exercise_id`), `set_sets` (`sets`), `set_reps` (`reps`), `set_weight` (`weight_lb`), `set_rest` (`rest_seconds`), `add` (`exercise_id`, `sets`, `reps`, optional `weight_lb`, `rest_seconds` and `position`), `remove`, `reorder` (`position`), `break_superset` (`superset_letter`, or `exercise_id` of a member). `exercise_id` names an exercise in today's workout. A `position` counts from 1 among today's exercises, a superset counting once |
| profile_update | `profile` with any of the coach profile and intake fields (an empty answer clears a choice), and or `gym`: `gym_id` to edit or none for new (then `name`), `name`, `add_equipment` and `remove_equipment` (lists of items, applied to the gym's list at Accept), `notes`, `make_default`. A card made before 27 Nov may carry a whole `equipment` list, which Accept still applies |

A day sent from the planner keeps its own shape (`plan_items`, Phase 3).

**Deciding.** One guarded step decides every card: `decide_proposal(card, accept, reason, today)`, with the person's own sign-in only (a coach's pass is refused). It answers rather than errors for every expected outcome: accepted, rejected, or refused with a code (`not_found`, `already_decided`, `out_of_date`, `expired`, `reason_too_long`, `invalid`, `try_again`) and a plain sentence for the card. A day sent from the planner is passed to `decide_planner_proposal`, as before. Decline takes an optional reason, folded to one line and refused over 300 characters.

**A card for today is worked out by the app first.** `proposal_context(card)` reads, with the person's own access, the running workout today (blocks, exercises, sets), today's plan (prepared plans, the active campaign's days, shifts and overrides, today's workouts), the library facts of the exercises involved, and what was lifted before. `src/rules/decide.ts` applies the change with the phone's own rules (`src/rules/today-change.ts`, built on `src/rules/session.ts`), and sends the result as `today`: the running workout's rows, or today's plan, or "out of date" with the reason. The database checks it against the account as it is now: if the workout or today's plan changed in between, it answers `try_again` and the app reads again (`src/lib/decide.ts`, which the inbox uses). The other four kinds are applied wholly inside the database.

### What the connector may not do

- It never calls out to any LLM or any other service. It only answers.
- A coach sign-in can read the user's rows and add rows to `proposals` and `proposal_targets`, and can record a weekly check-in through one guarded step (`record_weekly_checkin`, for the signed-in user only; added 24 Nov). It also notes each call in the call log through a second guarded step (`record_connector_call`, stage 4A), which stores no content. The database refuses every other write from a coach sign-in. Even a mistake in the connector's code cannot change a workout.
- How the database keeps this (stage 4A): every table's write rules need the app's own sign-in, except the two that add a pending proposal and its targets. Every function in the API's schema is closed, then opened to signed-in people by name; each one either refuses a coach's pass, only reads, or is one of the two guarded steps. Signed-out people can call nothing. New functions and tables start closed, so a forgotten grant fails safe. Tests list these doors, so a new one cannot appear unnoticed, and try each with a coach's pass, comparing the whole database before and after (`tests/db/coach-lock.test.ts`, and through the real API on Supabase's own local version, `tests/supabase/coach-lock.test.ts`).
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

Why the code: on an iPhone, a link tapped in Mail opens in Safari. Safari and the home-screen app do not share sign-ins, so the link would sign in the wrong place. A typed code works inside the home-screen app. Nate agreed this on 16 November as the fallback route (Decisions, row D).

- **Recovery** is the same email flow. There is no password to forget.
- **Sign-out** ends the sign-in on that device and clears what the app stored on it, after sending anything still unsent.
- **Deleting an account** offers an export (a zip holding one spreadsheet file per kind of record, plus one complete file for moving to another tool: question 32), marks the account, and a daily job removes everything 14 days later. Signing in during those 14 days offers to cancel.
- **Passkeys** are to confirm: if Supabase's sign-in does not support them directly, they are added with a small standard library or moved to a later phase.
- **Registration** is by single-use invite link from an admin. See "Invites and the admin page" below.

### Invites and the admin page

Decided by Nate on 16 November.

- **Admins.** An account is either an ordinary user or an admin. Nate's account is made the first admin once, when the app is set up. An admin can make another user an admin. An ordinary user cannot invite anyone.
- **Invite links are single-use.** Each link registers one account and then stops working. It also stops after 7 days if unused, and an admin can cancel it at any time.
- **Ready-to-paste invite.** Making an invite shows a block of text holding the link and the setup steps (register, add to the home screen, allow notifications, connect a coach). The admin copies it into their own email or message. The app sends nothing.
- **The admin page** shows the list of accounts (name, email, date joined, active or inactive) and the list of links (waiting, used, expired, cancelled).
- **What an admin can do** (decided 16 November):
  - **Create.** Type a person's name and email and get their single-use invite, as ready-to-paste text.
  - **Deactivate.** Block an account at once. The person cannot sign in and their coach connection stops. Nothing is deleted.
  - **Reactivate.** Undo a deactivation. Everything is as it was.
  - **Reset.** For someone who is locked out, or whose sign-in may be in the wrong hands. The app makes a single-use reset link and ready-to-paste instructions for the admin to send. **Making the link cuts off the old sign-in at once** (changed by Nate, 17 Nov 2026, after testing a real reset): the person's passkeys are removed, sign-in is blocked in Supabase until the link is opened, their coach apps are disconnected, and the database refuses every pass issued before the reset. Opening the link is then the only way back in: it sets up a new passkey. They reconnect their coach afterward.
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

**Proving it early.** Connector sign-in is named a "hard spot" in `docs/MODEL_AND_EFFORT.md`. Phase 1 starts with a small proof: sign-in plus one read tool on real accounts, tested from ChatGPT and from Claude, on the web and on the iPhone. If it fails, the fallback is chosen before the data model is built on top of it. This moves a slice of Phase 4 work forward. Nate approved it on 16 November (question 31). The same proof tries passkey-only sign-in (Decisions, row H).

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
- Three things on the phone reach beyond the session. A swap to an alternate not in the library adds that exercise to the library (Section 2). The lb/kg switch is a remembered display choice and is not a library edit (decided 17 Nov, question 3). The one-line note is a deliberate edit by the user to the exercise (confirmed by Nate, 17 Nov).
- **Supersets stay paired and equal during a session** (decided 17 Nov, questions 10, 11 and 39). Switching a set to a warm-up inside a superset applies to that round for every member: each member's set in that round becomes a warm-up, and each member gains one working set. Switching back undoes it for all members, if the added sets are not logged. One member can be swapped for another exercise, and the new one takes the same sets. Accepted with the design's approval on 17 Nov: Skip inside a superset skips the whole superset's remaining rounds, and one member cannot be skipped by itself. To drop one member, the user can break the superset first (below) and then skip that exercise.
- **Breaking a superset** (decided 17 Nov, question 41). When equipment for a superset is taken, the user can break it into individual exercises for this session. Each keeps its sets, reps and weight as defined.
  - A break splits every member apart, including in a superset of three. Pulling one member out while keeping the other two paired is not offered.
  - It is done on the phone during a session and changes only that session. The library workout and the campaign are not changed.
  - It can be done before the superset is started or part-way through. Sets already logged stay as logged. Only the sets left are done as individual exercises.
  - It can be undone until a set is logged after the break. After that the exercises stay individual for the rest of the session. **Built 20 Nov (Phase 3 opening), this design's own choices:** Undo gives each member back its set list as it was at the break, so a warm-up switch, + Set or a set to do deleted on one exercise since the break is undone with it and the superset comes back even; other changes since, such as rest, stay. Deleting a logged set of one of those exercises ends Undo, as logging one does. The set lists at the break are kept with the Undo copy (`sessions.break_undo`), so no database change is needed.
  - It is reached from the superset label on the active workout screen and from the superset's rows in the workout tray. New, not in the prototype.
  - This design's own choices, accepted with the design's approval on 17 Nov: the exercises keep the superset's place in the order, one after another, and can be reordered in the tray like any exercise; once broken, the paired warm-up rule and the equal-sets rule no longer apply to them.
- **A warm-up switch on a done exercise** (built 20 Nov, Phase 3 opening). Switching a set to a warm-up adds a set to do, so a done exercise or superset opens again and its clock runs on if it is the one on screen, as + Set does; switching it back stops it again. Records are worked out again for every member whose logged set changed, so a warm-up never keeps a record badge, on the phone or offline; the account's answer still wins once online.
- Finishing a workout part-way through a superset round can leave the members with different numbers of logged sets. That is a record of what happened, not a plan, and it is allowed.
- Sets left undone when a session finishes are marked Skipped and left out of efficiency. An exercise never started is Skipped.
- Only a proposal that replaces today's workout with a different one, such as a day sent from the planner, splits a running session (decided 17 Nov). If one is accepted mid-session, the session finishes with reason "replaced" and becomes an ad hoc session holding the work done. Its unreached sets are marked Replaced and left out of efficiency. A new session starts from the proposed workout.
- Every other today change accepted mid-session (swap, sets, reps, weight, rest, add, remove, reorder, break a superset) is applied inside the running session, to sets not yet logged. The session carries on.
- Editing a workout or exercise never changes any session, active or finished.
- **Built in Phase 2 (18 Nov). This design's own choices, for Nate to confirm:**
  - *Activity, for the 30-minute auto-finish,* is any step the person takes in the workout: starting, Start exercise, a logged, edited or deleted set, moving between exercises, a skip, +0:15 and the like. Rest running out by itself is not activity. The end time is the moment of that last step, and every clock is cut back to it.
  - *A second workout on another device.* When Start is tapped with a connection, the phone first asks the account whether a workout is already running. If one is, it offers **Carry on with it here** (the running workout is rebuilt on this phone from the account) or **Finish it, and start this one**. With no connection the new workout starts at once; when the phone is back online the account refuses it while the other is running, and the phone offers **Finish that one, keep this one** or **Finish this one, carry on with that one here**. Every set on both devices is kept whichever is chosen. "Finish it" ends the other workout at its last logged step, as the auto-finish does.
  - *Swap after sets are logged.* Until 19 Nov, Swap was offered only before a set was logged. **Built 19 Nov** (point 10): the sets logged stay with the exercise they were done on, and the sets left are done as the new exercise (spec Section 2, Quick-swap).
  - *Deleting a set* moves the sets after it up one. The set is removed and no fresh set is added; a set still to do can be deleted too, because the point of Delete is not having to do that work. In a superset, Delete removes that whole round from every member, including any of its sets already logged, and the confirmation says how many logged sets go with it (Nate, 19 Nov). This design's own choices: Undo after Log set takes back the log only and the set goes back to being one to do; an exercise is never left with no sets. Records are worked out again on the phone and by the server, and the server's answer wins.
  - *Reopening.* The phone offers Reopen on the finished screen, and on the start screen while the last workout is within 48 hours. The account refuses to reopen one finished more than 48 hours ago. Editing sets from History after 48 hours is built on the server side; the History screen itself comes with the planner (Phase 3).

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
- **Accept in one step** (built 26 Nov, stage 4D, migration `…20261126000100`). The card is marked accepted first, so its own edits do not mark it out of date; then it is applied; then the superset checks run at once rather than at the end of the step, so a card that would leave a superset uneven is refused and nothing of it is kept. A refusal that means the card can never apply as it stands (a target edited, a bundled name taken since, a change to today that no longer fits) marks it out of date; one that means it is malformed leaves it pending, to be declined.
- **Accepting a change to today** (built 26 Nov, stage 4D). With a workout running today, the change is made inside it, by the same moves the phone makes by hand: a swap (part-way through, the sets logged stay with the exercise they were done on and the sets left are done as the new one; in a superset it waits for the end of a round, and the card says to accept again then), + Set or − Set to reach the sets asked for, reps, weight and rest for the sets not yet logged, add, remove, reorder and break a superset. It never starts a new session, unlike a sent day. The account checks that every logged set is still on the exercise it was done on, or refuses. The workout's `plan_revision` goes up by one and the card's result keeps the changes. With no workout running, a new prepared plan for today is made from today's workout with the change applied, which Home and the phone start from, as with a sent day. Neither changes the library or the campaign.
- **The phone holding the running workout** (built 26 Nov, stage 4D). A copy the phone made before the change (its `plan_revision` is lower) changes only the workout's header and adds blocks and exercises the account has never seen, so sets logged with no signal are kept, and is answered with the session in `stale`. The phone then reads the changes it missed (accepted today cards for that session, newer than its revision), applies them to its own copy with the same rules, passing over any that no longer fit it (say the exercise was finished there with no signal), and sends its copy at the new revision. New rows a change makes take ids worked out from the card's id, so the account's copy and the phone's name them the same way and meet cleanly. The phone also asks on open and on return to the screen. If a change names an exercise the phone's library does not have yet, it takes the account's copy instead. A current copy that no longer has an exercise nothing was ever logged on takes it out (a removed exercise).
- **This design's own choices in stage 4D, confirmed by Nate on 27 November 2026:**
  - *A workout card that changes a superset's sets* makes any campaign day's set override for that superset follow the workout again, so supersets stay even on every day; Accept's message says how many days.
  - *A campaign card's days* set only the days listed: a listed day's overrides are replaced when the card lists overrides for it, and dropped when the day's workout changes. A shorter campaign drops the days past its new end. A shift forward leaves the week holding today (or the start, if later) empty, as the planner's Shift does.
  - *A change to today when today's workout is already finished,* or that names an exercise not in today's workout or already done, is out of date rather than applied.
  - *Removing an exercise with sets logged* ends it with those sets; in a superset part-way through, the superset is broken apart first.
  - *A card for today* ends at the next 3:00 am rollover whoever adds it, so a coach cannot give one a later end; every five minutes a scheduled step marks cards past their end as expired (migration `…20261126000200`), and Accept checks it to the second.
- **Accepting a sent day mid-workout** (built 20 Nov, Phase 3; Section 2, "Deciding a sent day"). In the same step as Accept, a running session is finished with reason 'replaced', at its last step with every clock cut back (`app.cut_back_and_finish`, as the 30-minute auto-finish does), its rest alert cancelled, and it becomes ad hoc with no campaign day, so the campaign's own day shows as Missed if not done. An exercise with logged sets is Done; one with none is Replaced, not Skipped, and is left out of efficiency (`sessionFromRows` reads Replaced as skipped for efficiency, and writes it back as Replaced). The sent day is started later from Home, as a new session, which names the one it split from (`split_from_session_id`). Home's Today panel does not count a replaced workout as today's being done.
- **The phone that still holds the replaced workout** (built 20 Nov). The account never reopens or overwrites a session it ended as 'replaced': a late `session.put` leaves its header, blocks and exercises as they are, adds only blocks and exercises it has never seen (an exercise added offline), and is answered with the session in `replaced` (a new list in the answer of `apply_changes`). It does not count as another workout running, so it raises no conflict with the new one. Late sets are kept (the app owns the history), and an exercise marked Replaced that receives one becomes Done. **Changed 23 Nov (review at high effort, migration `…20261123000100`):** the header stays as the account set it, but the blocks and exercises take the phone's late copy, with every clock stopped (time a block's clock was still running is banked up to the account's end time, or up to the phone's last step in its copy if that came later, so work done with no signal after the Accept keeps its time; a block never shows less than the account had: migrations `…20261124000100` and `…20261124000200`, 24 Nov; the workout's own end stays as the account set it), so a swap, a break or a reorder made before the changes arrived is kept (a swap before the first set used to leave its sets under the old exercise); an exercise still to do keeps the state the account gave it. If the late copy says the phone had finished the workout before the day was accepted (no signal, so its "finished" had not arrived), nothing was running to replace: the workout is put back as the phone finished it, on its campaign day, and is not listed as replaced. The phone drops its copy when an answer lists it, and also asks the account on open and on return to the screen, so an idle phone learns it too. It asks only after sending what it has waiting, and never about a workout whose own copy is still waiting, so a workout it finished offline is not wrongly called replaced (`idsToAskReplaced`, 24 Nov); then it says "Your workout was saved and replaced by the day sent from the planner", with **Go to Home**, where the sent day waits. It does not offer Reopen for it. Sets still waiting in the outbox are sent as usual. On the phone, Accept sends whatever the phone has waiting first, and refuses with a plain message if it cannot (23 Nov). It reads who is signed in on the device, not over the network, and refuses if no one is (24 Nov), as the table in Section 6 says; Accept in the planner on a computer cannot reach the phone's waiting changes, which is why the account handles a late copy as above.
### Campaign

| State | Allowed | How it leaves |
|---|---|---|
| Draft | Made by the user, by copying, or by accepting a coach's new campaign. Edit everything. Copy. Any number can wait as drafts | The user activates it. If another campaign is active, activating ends it after a confirmation (decided 17 Nov, question 21) |
| Active | Edit days and overrides at any time. Shift forward a week. Days become done or missed as time passes. Only one at a time | Its last day passes, or the user ends it |
| Finished | Read. Copy into a new draft. Run again from a new start date (Nate, 21 Nov): the same campaign becomes active, its shifts are cleared, and another active campaign ends after a confirmation. Its sessions stay in History | Run again |

- Weeks run Monday to Sunday. A campaign may start on any date, and week 1 is the week holding its start date (decided 17 Nov, question 19).
- When the active campaign finishes, the app prompts the user to ask their coach for the next one. It does not repeat or extend. During its last week (the week holding its end date), Home shows a note to ask the coach for the next one, saying to ask the coach in ChatGPT or Claude for the next campaign, with the Open my coach link; nothing is copied (Nate, 24 Nov; 27 Nov). The coach is in ChatGPT or Claude, not in the app.
- A day is **missed** when its date has passed with no session from it. Nothing moves. A missed workout stays available to start on a later day.
- A day is **done** when a session that came from it exists, logged on or after the campaign's current start date (so a campaign run again starts with no day done; changed 21 Nov). The date it was logged within that run does not matter.

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
| An exercise made by a swap while offline | It is created on the phone with its own id and sent with the outbox (`exercise.create`, put at the front of the queue so it arrives before any workout change that names it). If the user confirms its suggested details later, that is sent as an ordinary edit (`exercise.confirm`). Built 19 Nov |

Not available offline: sign-in, Accept and Decline, the planner, and anything the coach does.

### How it is built (Phase 2, 18 November 2026)

Built by an Opus 5.5 high-effort helper, as `docs/MODEL_AND_EFFORT.md` asks for this hard spot. Migration `supabase/migrations/20261117001100_saving_and_offline.sql`; the phone's side in `src/rules/sync.ts`, `src/lib/outbox.ts` and `src/lib/phone-store.ts`.

- **One door.** The phone sends its changes through one database function, `apply_changes`, with the person's own sign-in, so row-level security applies to every row it writes. A coach pass cannot use it. Each change is one of: the session with its blocks and plan snapshot (`session.put`, the whole thing each time, so it is safe to apply twice), one logged set (`set.put`), a deleted set (`set.delete`), finishing a workout left running elsewhere (`session.finish_other`), when rest ends (`rest.set`), the lb/kg switch (`display_unit.put`) and the note (`note.put`).
- **Exactly once.** Each change carries an id made on the phone. The function records it in `received_changes` in the same step as the change; a repeat answers "done" and does nothing. A change the database refuses (a number out of range, say) is answered "refused" with the reason, remembered, and taken out of the outbox; the phone shows "1 change could not be saved". Every id, block, exercise and set is a random id made on the phone, so the phone and the account name the same rows.
- **The phone works out the changes itself.** Every move in the workout produces the next state of the session; the phone compares it with the last one and queues what changed: deleted sets first, then the session, then new or edited sets lowest number first (so a set that moved up after a delete never meets the one it replaces), then the rest alert. A later copy of something not being sent right now replaces the earlier copy in its place, so a burst of taps sends one copy of the session.
- **When it is sent:** on app open, after each change, on reconnect, when the app returns to the screen, and every 20 seconds while something waits. The screen shows one quiet line: "Saved to your account", "Saving…", or "No connection. 2 changes saved on this phone, sent when you are back online."
- **Conflicts**, as the table above says: the last change to reach the server wins for a set; a deleted set stays deleted (the delete is kept as a marker, and a later edit of it is ignored); the server's records win (it works them out from the sets after every batch, with the same rules as the phone, and sends them back so the badges are corrected); the lb/kg switch and the note are sent like any other change, and the switch never raises the exercise's version.
- **History from the account.** `exercise_memory` gives the phone, for each exercise, the last 6 sessions in full and every record-holding set however old, leaving out the session running on that phone. "Last time", the seeded weights, the graph and record checks use it. A workout finished on the phone counts at once, before the account has it.
- **On the phone**, everything is kept per person (a second person signing in on the same phone sees nothing of the first), and sign-out sends anything unsent first, then clears it; with no connection it asks before losing anything. The service worker keeps a copy of the phone app so it opens with no connection.
- **Before this**, Phase 2's first screens kept the workout on the phone only. That phone-only copy is not carried over: it is left behind on first open (nothing of it was ever in the account).

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

**Moving between exercises** (decided 17 Nov, question 9). Only the exercise on screen in the workout has a running clock. Moving to another exercise pauses the one left. The new exercise's clock starts when Start exercise is tapped there. Coming back to the first exercise resumes its clock from where it stopped. A superset's members share one clock, so moving between members does not pause it. "On screen" means the exercise the workout is showing: locking the phone or closing the app does not pause it, and it keeps counting past double the budget. This matches the prototype. The clock resumes by itself when the user returns to a started, unfinished exercise, with no extra tap. Nate confirmed both points on 17 November.

These values are saved on the phone with the session and synced. After a crash, a closed tab or a restart, the app reads them and shows the correct times at once. The dial is drawn from the same numbers by the shared rules, so the acceptance tests for half, empty, half red and full red test plain arithmetic.

Auto-finish: when 30 minutes pass with nothing logged, the phone finishes the session on next open, and a server job does the same for sessions it knows about. Either way the end time is the last logged entry and the clocks are cut back to it. **Built in Phase 2 (18 Nov):** on the phone at open and every 30 seconds while the app is open, and by the scheduler every minute (`app.auto_finish_idle_sessions()`, migration `…1200`). If the phone was offline and the server finished a workout the person was still doing, the phone's next change makes it active again, because the phone is the working copy.

### Rest end with the app on screen

A banner and a short sound, made by the app. The sound is set up so it mixes with music from other apps and does not interrupt it. The sound is unlocked by the user's own tap on Log set, which iPhones require. Confirmed on Nate's iPhone on 17 Nov, where a beep 20 seconds after a tap played over music. **The sound follows silent mode** (Nate, 17 Nov): an iPhone mutes a mixing sound on silent, and a web app's only way to play on silent stops the music, so on silent there is no sound and the banner carries the alert.

### Rest alert with the app in the background

An iPhone suspends a web app shortly after it leaves the screen, so the app cannot ring its own alarm. The server does it.

1. When rest starts, the phone tells the server the moment rest will end. +0:15 updates it. Skip cancels it.
2. A scheduler inside Supabase looks every few seconds for alerts about to come due and hands them to the app's server, which waits out the last moments and sends a push notification on the second.
3. The phone shows "Rest over. Time for your next set." Tapping it opens the app at the current exercise.
4. If the app is on screen when rest ends, the app cancels the alert just before, so the user gets the banner and sound and not a notification as well.

**Built in Phase 2 (18 Nov)**, on the method the iPhone test page proved (0.0 seconds late). The rest timer itself tells the account when rest ends, through the outbox (`rest.set`), so +0:15 and Skip follow by themselves. The scheduler hands each alert due within 6 seconds to `/api/rest-due` every 5 seconds (migration `…1200`), which waits to the second, checks the alert is still wanted, marks it sent and sends "Rest over / Time for your next set." to every phone the person turned rest alerts on for (`push_subscriptions`). Tapping it opens `/app/workout`, which returns to the current exercise from the phone's storage. With the app on screen the phone cancels the alert 2.5 seconds before the end, and asks for it again if the app leaves the screen in those seconds. This design's own choice: if the app comes back more than 5 seconds after rest ended, it shows no banner and plays no sound, because the notification already said so. Finishing a workout cancels its alert. Each phone turns rest alerts on once, with **Turn on rest alerts** on the workout screens; the iPhone test page's permission does not carry over, because it kept its own throwaway address book.

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

### The app icon

- One fixed icon for now (Nate, 25 Nov): the chalk handprint gripping a dumbbell in ember on near-black, with no words. The original, 1024 pixels square, is `docs/app-icon-source.jpg`.
- The iPhone uses `src/app/apple-icon.png` (180 pixels); the browser tab uses `src/app/icon.png`; the web app manifest lists `public/icons/icon-192.png` and `icon-512.png` for other phones. All are made from the original.
- The icon is a picture, not a style, so the token rule does not apply to it. The sign-in check lets these files through without signing in, since the iPhone fetches the icon before anyone is signed in.
- A home-screen web app cannot change its own icon: the iPhone keeps the copy it took at Add to Home Screen. An icon that follows the chosen skin would mean serving that skin's icon and the user adding the app to the home screen again. Not planned; Phase 5 at the earliest, with the skin picker.

---

## 9. Testing

**In short:** almost every acceptance test in Section 8 of the spec is arithmetic or a rule, so it is tested directly and fast. A smaller set is tested by driving the real app in a test browser. Four need a real iPhone, as the spec marks, and I suggest adding a few more device checks.

### Layers

| Layer | What it is | Tool |
|---|---|---|
| Rules | The shared rules module, tested with plain inputs and outputs | Vitest |
| Database | A local copy of the database with two test users | Vitest: quick tests on an in-memory stand-in for Supabase, and, from Phase 2, the account tests against Supabase's own local version in GitHub's test runs (`npm run test:supabase`) |
| Connector | Real MCP calls against a local server, signed in as test users | Vitest |
| App | The real app driven in a test browser, including the iPhone's browser engine and an offline switch. From Phase 2, the passkey steps run with the test browser's stand-in passkey (`npm run test:browser`) | Playwright |
| Code checks | Scans of the codebase run on every pull request | Small scripts |
| Device | Nate, by hand, on an iPhone | A written checklist per phase |

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
| | Background notification at rest end | **Device**. The server side (alert scheduled, moved by +0:15, cancelled on Skip and on finish) is automated (`tests/db/sync.test.ts`) |
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
| | Intake answers outside their lists, or more than three priorities, refused | Database, Connector, App |
| | Decline with no reason, and with a reason up to 300 characters; longer refused | Database, App |
| | The Coach button's count goes down after Accept or Decline; the banner after Accept | App |
| | One check-in per week however often the summary is read; marks on Home; check-ins in a row | Database, Rules, App |
| | The last-week note shows only in the week holding the campaign's end date | Rules, App |
| | Tool descriptions carry their brief items; the coach instructions name every tool | Code checks |
| | Coach setup completed unaided | **Device** |
| Coach behaviour (evals) | Scenarios E1 to E19 | Agent pass and Nate's client pass (below) |
| Theming | Switching skins moves and resizes nothing | App: record every element's position and size under each skin and compare |
| | No color or font outside the token files | Code check |
| | Reduced motion: no dust or shake | App, with reduced motion switched on |
| Resilience | Close mid-session and reopen, same exercise, sets and clocks correct | App: close the page, move the clock forward, reopen (`tests/browser/offline.spec.ts`). Also Rules (`tests/rules/sync.test.ts`) |
| | Offline set appears exactly once | App with the network off, then on (`tests/browser/offline.spec.ts`). Also Database: the same change sent twice, an answer lost, offline then online in order, delete wins, auto-finish, and each person's changes kept to their own rows (`tests/db/sync.test.ts`, and on Supabase's own local version `tests/supabase/sync.test.ts`) |
| | Screen stays awake for a full session | **Device** |
| Friends | A new user registers, installs and connects a coach unaided | **Device**, with a friend |

### Coach behaviour evals (24 Nov)

The spec's scenarios E1 to E19 (Section 8) test the coach, not the app's code, so they sit outside the automated tests. The app still never calls an LLM: in every eval a coach connects to the app exactly as a user's coach does.

- **The eval account.** A separate account, so evals never put cards in Nate's real inbox: Nate's Phase 1 test account, named "Test Account", is reused for it (Nate, 25 Nov). Each reset replaces what is in it. A fixed starting data set is loaded into it: two gyms (a full home gym, and a hotel gym with dumbbells to 50 lb, a bench and bands), an intake filled in, eight weeks of history, an active campaign, and past proposals (one declined with a reason, one with none, one declined four weeks ago). Each scenario names the state it needs (for example "empty profile" or "campaign ends in five days"), and a reset puts the account into that state. The scenario prompts and states live in `tests/coach-evals/` (`scenarios.json`, `states.mjs`).
- **How the data is loaded** (stage 4A). `states.mjs` builds each state with every date worked out from the moment of the reset, so "yesterday's proposal" or "the campaign ends this week" is true whenever it runs. One database step, `load_coach_eval_state`, clears the eval account's training data, seeds the starter library again and loads the state, all or nothing. Only the server's key can call it, and it refuses to run unless exactly one account is marked as the eval account, so it can reach no one else's data. The reset runs on GitHub (the "Reset the coach eval account" workflow, or `scripts/coach-eval-reset.mjs` anywhere with the two settings), with a secret key of its own kept in GitHub's secret store, never in the repository and separate from the live app's key. An agent runs a reset with `gh workflow run coach-eval-reset.yml -f state=<state>` and never sees the key. The spec's "campaign ends in five days" is loaded as a campaign whose last week is this week, since a campaign always ends on a Sunday.
- **The agent pass.** An agent session adds the connector as its own coach connection, signs in to the eval account, takes the coach instructions as its instructions, and runs every scenario. It records the tool calls made and the reply, and scores each against Must and Must not. It runs on Sonnet 5.5 at medium effort, close to the coaches people use (`docs/MODEL_AND_EFFORT.md`). An agent session can attach to the connector this way (confirmed 27 Nov, Section 10C).
- **Nate's client pass.** The core set (★) in ChatGPT on his iPhone, and E2 and E4 in Claude, on the eval account, from a short checklist in `docs/SETUP.md`. Only Nate judges E14, the tone.
- **When a scenario fails.** Change the tool description, the error message or the connector's instructions (or, with Nate's agreement, the coach instructions), then run the failed scenario again with every other scenario that uses the same tool.
- **When evals run.** The agent pass runs on the live app after a stage that changes tools merges (4C, 4E and 4H), and in full before the phase is offered for acceptance. From then on, the full agent pass runs again whenever a tool description, an error message, the connector's instructions or the coach instructions change. LLMs vary from run to run, so a scenario that passes only some of the time counts as a failure.
- **Results.** One file per run in `tests/coach-evals/results/` (date, coach app, model, and pass or fail per scenario, with a line on each failure). One line in `docs/LOG.md` per full pass.

### Device checks I suggest adding

These are not in the spec's list but cannot be trusted from a desktop test:

- The passkey signs in inside the home-screen app (or the emailed code, if the fallback is used).
- The rest sound plays without stopping music from another app. With the iPhone on silent it does not play.
- The notification permission prompt appears only after the app is on the home screen.
- The connector sign-in completes from the ChatGPT iPhone app and the Claude iPhone app.
- A session survives the phone being locked for ten minutes mid-rest.

The three platform facts in Section 7 of the spec (notifications from iOS 16.4, server-sent rest alerts, wake lock from iOS 18.4) are confirmed on a real iPhone in Phase 1, as the spec asks.

---

## 10. Open questions

These are places where the spec is unclear, silent or disagrees with itself. They are listed, not resolved. Each has the assumption this design makes so that work is not blocked. Nate's answer replaces the assumption.

Nate answered this whole list on 17 November, in two rounds. Every row is now decided, and the rest of this design and the spec follow it. Three rows carried a small detail then marked "awaiting Nate's confirmation": question 12 (four details of the seeded weight), question 14 (how bodyweight volume sits beside a workout's pounds total) and question 39 (Skip inside a superset). All three were accepted with the design's approval on 17 Nov. Question 40 records a new rule from Nate. Question 41 records his feature request to break a superset during a workout, decided on 17 November. A few details of how it works are this design's own choices, marked as such in that row.

### A. The spec disagrees with itself

| # | Question | Where | Assumed until decided |
|---|---|---|---|
| 1 | Who may register? "Nate and a small group of friends" on a public web address, with self-service registration and no stated way to keep strangers out | Sections 2 and 10 | **Decided 16 Nov:** single-use invite links, made only by an admin on an admin page. The spec is updated |
| 2 | Converted weights: Section 8 expects 60 lb to show as 27.22 kg (two decimals). Section 10 says converted weights show to one decimal (27.2). The prototype rounds to the nearest half | Sections 8 and 10 | **Decided 17 Nov:** one decimal. Converted weights show to one decimal, so the acceptance test now expects 27.2 kg. A typed value still shows exactly as typed, and storage stays at three decimals in pounds (27.5 kg still stores as 60.627 lb). The spec is updated |
| 3 | "The library is never changed by use", yet the phone's unit switch and note line change the exercise during a workout | Sections 1, 2 and 5 | **Decided 17 Nov:** the phone's lb/kg switch is a remembered display choice, kept apart from the exercise's library design. The exercise keeps its default unit as a library field, changed only by a deliberate edit in the planner or an accepted proposal. The switch is stored separately per exercise (`exercise_display_units`), does not raise the exercise's version and never makes a proposal out of date. On the phone, history, records and graphs show in the remembered unit. Bodyweight is not switchable. The spec is updated. Confirmed by Nate later on 17 Nov: the one-line note typed on the phone is a deliberate edit by the user to the exercise; and a later change to the default unit in the planner leaves the phone's remembered choice as it is |
| 4 | Proposal states: Section 3 lists pending, accepted, rejected. Section 10 adds out of date, and today proposals expire. Section 4 says `get_proposal_status` returns one of three | Sections 3, 4 and 10 | **Decided 17 Nov:** five states (pending, accepted, rejected, out of date, expired), all visible to the coach. The spec is updated |
| 5 | "Decline discards it" and "any proposal can be dismissed at any time". Are Decline and Dismiss the same thing? | Sections 4 and 10 | **Decided 17 Nov:** yes. Both end as rejected. The spec is updated |
| 6 | Sign-in by emailed link does not work inside the iPhone home-screen app | Section 9, decision 4 | **Decided 16 Nov:** agreed, as the fallback route. Passkey sign-in is the first choice (question 35) |
| 7 | Skins must not resize elements, yet heading size and numeral size are tokens that differ by skin | Sections 1 and 6 | **Decided 17 Nov:** text sizes may differ by skin. Boxes keep fixed sizes, so nothing moves. The spec is updated |
| 8 | Section 9 opens with "seven points are not yet decided" and "rows 4 and 6 to 10 are confirmed", but the table has fourteen rows | Section 9 | **Decided 17 Nov:** cleaned up. The opening of the spec's Section 9 now says which rows are answered, confirmed, changed or approved, and which are still open. Row 5 (hosting and stack) now says it is approved |

### B. The spec does not say

| # | Question | Assumed until decided |
|---|---|---|
| 9 | Does the exercise clock keep running when the user moves to another exercise and comes back? The spec says it never stops while the exercise is "open". The prototype pauses it when you leave | **Decided 17 Nov** (Nate said no to the earlier assumption): moving to another exercise pauses that exercise's clock. The other exercise's clock starts when Start exercise is tapped there. Coming back to the first exercise resumes its clock from where it stopped. This matches the prototype. Members of one superset share one clock, so moving between them does not pause it. The workout clock is unaffected. The spec is updated. Confirmed by Nate later on 17 Nov: the clock resumes by itself when the user returns to a started, unfinished exercise, with no extra tap; and locking the phone or closing the app does not pause it |
| 10 | Superset budget when members have different set counts. The spec's formula assumes equal rounds | **Decided 17 Nov:** supersets are always paired and equal, in the design and during a live session. Every member has the same number of sets; reps can differ. So the budget is the spec's own formula: rounds × the sum of each member's work seconds + (rounds − 1) × the first member's rest. Any change to sets in a superset applies to all members: in the planner and day overrides the app changes them together, and a coach's proposal or today change must change them together or is returned as an error. An exercise joining a superset takes its set count (confirmed by Nate). This reverses the spec's earlier rule on uneven supersets, and the spec is updated. For the live session, see question 39 |
| 11 | Which rest applies to the solo rounds at the end of an uneven superset: the remaining member's, or the first member's? | **Decided 17 Nov:** does not apply. Supersets are always equal, so there are no solo rounds (questions 10 and 39) |
| 12 | The "seeded" weight: the weight pre-filled in the weight box when a day sets no weight. A workout item has no weight field, so where does that first number come from? | **Decided 17 Nov:** the box for set N is pre-filled with the weight of set N from the last session in which the exercise was done. Nate's example: if set 1 was 80 lb and set 2 was 90 lb last time, today's set 1 seeds 80 and set 2 seeds 90. If that session had no set N, the box is pre-filled with the heaviest set from it. Tapping into the box clears it ready for a new number. Logging without touching it commits the seeded value, keeping its exact pounds value, as with a converted weight. The spec is updated. Accepted with the design's approval on 17 Nov: (a) "the heaviest previous set" means the heaviest set of that last session, not of today's; (b) a weight set by a campaign day override or an accepted proposal wins over the seed; (c) the very first time an exercise is done, the box is empty; (d) reps are pre-filled from the planned reps, as now |
| 13 | How is a drop set marked, and where is RPE (an effort rating: a 1 to 10 score for how hard a set felt) entered? Neither is in the prototype | **Decided 17 Nov:** a long press on a set row opens set details: type and RPE. The spec is updated |
| 14 | Bodyweight exercises: what counts as volume, and how are bars drawn? | **Decided 17 Nov:** a bodyweight set is recorded as a weight of 1 bodyweight unit ("1 BW") and a rep count. Nate's example: 20 push-ups is a weight of 1 BW and a count of 20. Its volume is 1 × reps, counted in BW units and kept apart from pounds totals. On the graph, the bars are all the same height (1 BW) with the reps on top, and total reps plays the part that volume plays for a weighted exercise, including the volume line. The spec is updated. Accepted with the design's approval on 17 Nov: a workout's summary shows bodyweight volume as its own figure beside the pounds total, for example "8,450 lb · 60 BW", rather than adding the two together |
| 15 | Can a bodyweight exercise carry added weight (a weighted pull-up)? | **Decided 17 Nov:** no. It would be a separate exercise with a weight unit |
| 16 | A swap to an alternate not yet in the library: what muscle group, equipment and unit does the new exercise get? Only a name is stored | **Decided 17 Nov:** the swap creates the new exercise straight away. The phone shows a simple one-tap confirm of suggested details: muscle group, focus, work and rest seconds copied from the original; unit bodyweight for the bodyweight tier, otherwise the original's unit; equipment suggested where it can be. If the user does not confirm, the exercise still enters the library with whatever is known, and missing fields stay empty. The planner flags exercises with missing fields as incomplete and never blocks their use. Those fields are optional only for this case, and stay required for a coach's proposed exercise (Section 2). The spec is updated. Confirmed by Nate later on 17 Nov: a swap-made exercise starts with no alternates, and that does not make it incomplete |
| 17 | Records and ties, and records within one session. Does a second set today that beats the first set today count? | **Decided 17 Nov:** a record must strictly beat the best before that set, including earlier sets today. A tie is not a record and gets no celebration or badge. Nate's addition: when a set ties the best, the date shown for that record moves to the most recent date it was achieved. The spec is updated. Confirmed by Nate later on 17 Nov: the record then also shows that latest set's reps, where they differ (for example 60 lb × 10 tying a 6+ record of 60 lb × 8) |
| 18 | Estimated one-rep max "taken from the best set". Best by what measure, and over what period? | **Decided 17 Nov:** the set with the highest estimate, over all history, working and drop sets only. The spec is updated |
| 19 | Must a campaign start on a Monday? Which day starts the week? | **Decided 17 Nov:** weeks run Monday to Sunday. A campaign may start on any date, and week 1 is the week holding that date. The spec is updated |
| 20 | "Send to phone as today's workout" when the campaign already has a workout today. Does it replace it or sit beside it? | **Decided 17 Nov:** it gets the proposal treatment. It arrives in the inbox as a card saying what would replace what, with Accept and Dismiss. Accept makes it today's workout for today only and changes neither the library nor the campaign. Dismiss changes nothing. It comes from the user's own planner, so its source is 'planner'. The existing rule for accepting a today proposal mid-session applies unchanged. The spec is updated. Confirmed by Nate later on 17 Nov: when today has no workout planned, a sent day becomes today's workout straight away, with no card. Also accepted: after Accept, the campaign's own day for today shows as Missed if not done, like any other day, and the user can remove it from the campaign if they do not mean to do it |
| 21 | When a proposed campaign is accepted, does it become active? What if another is active? | **Decided 17 Nov:** it arrives as a draft. The user activates it. Activating one ends the current one after a confirmation. The spec is updated |
| 22 | Can a workout or campaign proposal include brand-new exercises, or must each be proposed and accepted first? "Unknown exercises" are errors | **Decided 17 Nov:** bundled. A workout proposal may carry new exercises, and a campaign proposal may carry new exercises and new workouts, in the same proposal. One card lists everything and one Accept applies all of it or none. "Unknown exercise" as an error now means not in the library and not defined in the same proposal. Bundled new exercises pass every check a `propose_exercise` call would, including the three alternates. A today proposal does not bundle. The spec and the coach instructions are updated |
| 23 | Does the app require three alternates on a coach-proposed exercise, or is that only advice in the coach instructions? | **Decided 17 Nov:** required for a new exercise from a coach. Optional when the user adds one by hand. The spec is updated |
| 24 | When does a today proposal expire: midnight, or the 3:00 am rollover? | **Decided 17 Nov:** the 3:00 am rollover, to match how days work everywhere else. The spec is updated |
| 25 | Is gym equipment free text, or picked from the equipment vocabulary? | **Decided 17 Nov:** a free list. Gyms have things the vocabulary does not, such as a rower. The spec is updated |
| 26 | Removing or renaming a vocabulary value that exercises use | **Decided 17 Nov:** renaming carries through to every exercise, and a value in use is archived, not deleted. Example 1: renaming the equipment value "selectorized machine" to "pin machine" changes it on every exercise that uses it. Example 2: removing the focus value "brachialis" while an exercise uses it keeps it on that exercise but takes it out of the pickers, and it can be restored. Nate's addition: the vocabulary is managed only in the browser planner, never on the phone, so the phone stays uncluttered. The spec is updated |
| 27 | The prototype uses three style values the spec's token list does not name: text on a selected button, display font weight, and heading capitals | **Decided 17 Nov:** added as "extras" in each skin file. The spec is updated |
| 28 | Who writes the starter library of about 40 exercises with alternates, and the starter work and rest seconds? | **Decided 17 Nov:** a project task in the development work. The coding agent drafts the list in Phase 1 for Nate to review. The spec's roadmap is updated **Later, 17 Nov:** an outside coach reviewed the draft and expanded it to 227 exercises. Nate approved that for every account, with 14 rest times made consistent with the default rule and no change to the coach's muscle groups |
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
| 39 | New, 17 Nov. A superset's design is always even (question 10), but two things can still make it uneven during a live session: switching one member's set to a warm-up adds a set for that member only (spec Section 2), and the user can skip one member's remaining sets. What happens then? | **Decided 17 Nov: does not apply.** Nate: sets remain aligned with all exercises in a superset. Switching a set to a warm-up inside a superset is a paired effect: that round becomes a warm-up for every member, and each member gains one working set, so the budget grows by one round. Switching back undoes it for all members, if the added sets are not logged. The spec is updated. Accepted with the design's approval on 17 Nov: Skip inside a superset skips the whole superset's remaining rounds; one member can be swapped for another exercise but not skipped by itself. Finishing a workout part-way through a round can leave logged sets uneven. That is a record of what happened, not a plan |
| 40 | New rule from Nate, 17 Nov: the spec never said how many exercises a superset can hold | **Decided 17 Nov:** two or three. A superset letter used by one item, or by four or more, is refused in the planner and returned to the coach as an error. The spec and the coach instructions are updated |
| 41 | New feature request from Nate, 17 Nov: "sometimes equipment needed for a superset is blocked or utilized, need the ability to break a superset into individual exercises while preserving set / rep / weight as defined" | **Decided 17 Nov** (Nate: "break all three, assumptions accepted"): during a workout, the user can break a superset into individual exercises, and each keeps its sets, reps and weight as defined. A break splits every member apart, including in a superset of three; pulling one out and keeping a pair is not offered. It is done on the phone during a session and applies to that session only; the library workout and the campaign are not changed. After the break each exercise has its own clock and its own budget (the single-exercise formula on its sets left), and rest follows every set, using that exercise's own rest. It can be done part-way through: sets already logged stay, and only the sets left are done individually. It can be undone until a set is logged after the break. The coach can propose the same break as a today-only change, with a new `break_superset` action in `propose_today_change`. It is reached from the superset label on the active workout screen and from the superset's rows in the tray, and is new, not in the prototype. **This design's own choices, accepted with the design's approval on 17 Nov:** (a) the shared clock's time so far stays with the superset and counts toward efficiency for the sets logged before the break; (b) the exercises keep the superset's place in the order, one after another, and can be reordered in the tray; (c) once broken, the paired warm-up and equal-sets rules no longer apply to them; (d) a coach's break accepted mid-session is applied inside that session without starting a new one, and one accepted before the session starts is held in today's prepared plan; (e) on undo, any time on the new exercises' clocks goes back to the superset's clock. The spec and the coach instructions are updated |

### C. Facts to confirm with a small test

I did not check these against current documentation in this sitting. Each is confirmed in Phase 1 before anything is built on it.

| Fact relied on | If it turns out false |
|---|---|
| Supabase's sign-in can act as the sign-in for the connector, and ChatGPT and Claude accept it | Use a sign-in company (WorkOS or Stytch), or a small sign-in server in the app |
| A coach pass can be told apart from an app sign-in inside the database, so the database can refuse coach writes | Enforce the same limit in one guarded module of the connector, with tests |
| Supabase's sign-in supports passkeys | Add them with a small standard library, or move passkeys to Phase 5 |
| Supabase's scheduler can run every few seconds | Use a delayed-message service (one more account), or accept alerts up to a minute late. **Confirmed 17 Nov 2026:** a rest alert reached Nate's iPhone 0.0 seconds late |
| Web Push reaches an iPhone home-screen app from iOS 16.4 | No fallback on the web. Rest alerts would be foreground only until the native app. **Confirmed on Nate's iPhone, 17 Nov 2026** (10E, point 10) |
| Screen Wake Lock works in a home-screen app from iOS 18.4 | A known workaround, a silent looping video. Tested before use. **Confirmed on Nate's iPhone, 17 Nov 2026** |
| A web app's sound can mix with music without interrupting it | The rest sound becomes optional and off by default. **Confirmed on Nate's iPhone, 17 Nov 2026, with the iPhone off silent.** On silent it is muted; playing on silent stops the music (10E, point 10) |
| The home-screen app keeps its stored data indefinitely | The app warns when unsent sets exist and syncs more eagerly |
| The Vercel and Supabase free tiers fit this use | Paid tiers |
| A coach app's scheduled tasks can call a custom connector, so the weekly summary can arrive without being asked for | The user asks their coach for the week's summary by hand. Nate plans a scheduled task on the LLM side, or his Dot agent, which he has shown can call the connector. A ChatGPT scheduled task is not tested yet; Nate expects it to work (20 Nov) |
| A passkey can be the only sign-in method with Supabase, and works in the iPhone home-screen app and on the coach-connection page | Sign in by emailed code, which needs an email service and a domain |
| ChatGPT and Claude give their model the connector's own instructions (added 24 Nov, Section 3) | The tool descriptions and the pasted coach instructions carry the brief, as they do anyway. **Claude Code: confirmed 27 Nov 2026** (the coach eval agent pass). ChatGPT and the Claude app not yet checked |
| An agent session can add the connector as a coach connection, for the agent pass of the coach evals (added 24 Nov, Section 9) | The agent pass runs in Claude on the web with Nate signed in, or Nate runs more of the scenarios himself. **Confirmed 27 Nov 2026:** a Claude Code session in the desktop app, with the connector signed in to the eval account, ran E9, E15, E16 and E18 (`tests/coach-evals/results/`) |

### E. Phase 1 findings (17 November 2026)

Added during Phase 1 on Opus 5.5 at high effort. The sign-in proof's research was done by an Opus 5.5 high-effort helper, as `docs/MODEL_AND_EFFORT.md` asks for hard spots. Sources are listed in the proof's README, removed with the proof in stage 4B and kept in the repository's history: [`proofs/connector-signin/README.md`](https://github.com/trantelica/chalk-and-iron/blob/0852e08/proofs/connector-signin/README.md).

**Proof result, 17 November 2026.** Nate ran the proof. Passkey-only sign-in worked on the iPhone, in Safari and in the home-screen app, with no email sent. ChatGPT (web, a project, the iPhone app, the Codex and Dot agents) and Claude (web, a Project, the iPhone app) both connected through Supabase's OAuth server and read as coach passes. Disconnect stopped both at once. On 20 Nov a ChatGPT coach pass had renewed itself, days after connecting, with no new sign-in (proof check 16). The design's first choices stand: Supabase for app sign-in and coach sign-in, and passkeys with no email. The fallbacks in 10C are not needed. Details are in [the proof's README](https://github.com/trantelica/chalk-and-iron/blob/0852e08/proofs/connector-signin/README.md) (in the repository's history).

What the research found, against the facts in 10C:

| Fact from 10C | What Phase 1 found |
|---|---|
| Supabase's sign-in can act as the sign-in for the connector | Yes, in beta: an OAuth 2.1 server with PKCE and dynamic client registration, and a consent page we host at `/oauth/consent`. Confirmed by the proof on 17 Nov, for ChatGPT and Claude |
| A coach pass can be told apart inside the database | Yes: a coach pass carries a `client_id` claim. The database rules use it in one function, `app.is_coach()` |
| Supabase's sign-in supports passkeys | Yes, natively, in beta. The app uses them, so it has no passkey table of its own and no extra passkey library |
| A passkey can be the only sign-in method | Yes, with one server step: a passkey can be added only to an existing, signed-in person, so opening an invite or reset link creates the sign-in record, signs the person in once with a one-time token that is never emailed, and then creates the passkey. Confirmed by the proof on 17 Nov, on the iPhone in Safari and in the home-screen app |

Points that differ from or add to this design. Each is recorded here for Nate, not decided by the build:

1. Section 4 says the connector supports "both common ways" for a coach app to register itself. Supabase supports only one (dynamic client registration). Claude's connector setting must be "Register automatically".
2. Supabase does not name the connector in a coach pass's audience, as MCP asks. The connector makes up for it by accepting passes only from this Supabase project and checking each with Supabase on every call. Phase 4 keeps both checks.
3. "Disconnecting cancels the pass at once" holds only because of that per-call check. A pass checked locally would stay valid until it expires, about an hour. Confirmed by the proof on 17 Nov: with the per-call check, Disconnect stopped ChatGPT and Claude at once. Phase 4 keeps the per-call check.
4. The Supabase project needs the newer signing keys (ECC P-256), so the connector can check passes. This is a setup step in `docs/SETUP.md`.
5. A reset also removes the person's old passkeys, through Supabase's admin tools (`src/server/accounts.ts`). **Changed by Nate on 17 Nov, after testing on his real account:** all of this happens when the admin makes the reset link, not when the link is opened, because a reset means the old sign-in can no longer be trusted. As a second lock, each profile records when its sign-ins were cut off, and the database refuses any pass issued before that moment, from the app or a coach (`supabase/migrations/20261117000400_reset_cuts_off_at_once.sql`). Nate's retest found that the database cannot delete Supabase's long-lived renewal tokens, so a signed-in device fetched a fresh pass after the reset and got past that date check. So the server also blocks the account in Supabase's sign-in service from the moment the reset is made, the same block deactivation uses, and lifts it when the link is opened. While blocked, no device can fetch a fresh pass or sign in. A second retest found that an Admin page still running older app code could ask the database for a reset directly, skipping the server's steps. So a reset can now only be made through the app's server: the database refuses one asked for from a page (`supabase/migrations/20261117000500_reset_only_through_server.sql`). The server checks that the person asking is an admin, then always blocks sign-in, removes the old passkeys, checks both worked, and logs a line, reporting any failure to the admin.
6. **For Nate:** a passkey belongs to one web address. Question 37 chose the permanent address "before the first friend is invited". It needs choosing before Nate makes his own real passkey, or his passkey and coach connection must be redone after the change. **Decided 17 Nov:** Nate chose `https://chalkandiron.vercel.app` as the permanent address. He first picked `https://chalkandiron-trantelica.vercel.app`, because the short one looked taken, but it turned out to be his own project's address. Both accounts moved to new passkeys on the short address the same day, and the long one forwards to it.
7. Vercel's preview Deployment Protection blocks ChatGPT, Claude and passkeys, so it is off for the proof project.
8. Both Supabase features are in beta, and the passkey interface may change without notice. The fallbacks in 10C stand: a passkey library (SimpleWebAuthn) with the same one-time-token step, or a sign-in company.

9. **Starter library version 2 (17 Nov).** An outside coach reviewed the 42-exercise draft and returned 227, with every swap itself a starter exercise. Nate approved it for every account. The coding agent made 14 rest times consistent with the default rule and, at Nate's direction, changed no muscle group or focus. Accounts made with version 1 are updated by `supabase/migrations/20261117000600_starter_library_v2.sql`. It applies the coach's edits to the first 42 only where a detail is still as the app first set it, adds the new exercises except any name the account already has (archived ones included), and links each swap to the exercise of that name. It deletes nothing and is safe to run more than once. Each edit raises the exercise's version, as any edit does. **For Nate, before Phase 2 builds records and totals:** the coach's notes set four logging conventions that the weight-and-reps rules do not yet allow for. (a) Assisted machines log the assistance, so a lower number is the better set, and records, the seeded weight and volume would read the wrong way round. (b) Sleds count one fixed-distance trip as one rep, with distance only in the note. (c) Bands log a nominal resistance in pounds. (d) Dumbbell lifts log pounds per dumbbell and one-sided lifts log reps per side, so volume counts one dumbbell and one side. **Decided by Nate on 17 Nov:** (a) assisted machines get an assisted flag: less assistance is better, records are the least assistance for that many reps or more, there is no estimated one-rep max, and volume is total reps. (b) Sleds need no special rule: a sled is a lift over a longer distance, one trip is one rep. (c) Bands are bodyweight exercises, because band resistance is not standardized or labeled. (d) Dumbbells are logged and recorded per single dumbbell; records, the seeded weight and the graph's bars use that number. Each exercise carries a load count (1, 2 or 4) so that volume is the total weight moved. Nate confirmed later on 17 Nov that the per-side rule applies to every single-side exercise, not only dumbbells. **Bands done in Phase 1** (17 Nov): the 14 band exercises are bodyweight in `data/starter-library.json`, and `supabase/migrations/20261117000700_bands_are_bodyweight.sql` switches them in existing accounts. It leaves alone any band exercise that already has a logged set. **Built at the start of Phase 2 (17 Nov):** the `assisted` and `load_count` fields (Section 2), set for the two assisted machines and for each dumbbell or single-side exercise, in every account and in the data file (point 10). The coding agent proposed each starter exercise's load count, and Nate approved them all on 17 Nov.

10. **Phase 1 review (17 Nov), on Opus 5.5 at high effort, and what Phase 2 found and decided.** This point keeps the findings and decisions only. Who did what, and when, is in `docs/LOG.md`. All 109 tests passed at the review, and the type check and build were clean. The review found:
    - **A reset may not stay shut after its link is opened.** The database cannot remove Supabase's renewal tokens (point 5), and opening the link lifts the sign-in block. An old device, or a connected coach, still holding a renewal token could then get back in without a passkey.
    - **The 14-day account clean-up had never run on real Supabase.** It deletes from Supabase's own sign-in table, which might be refused for the same reason as the renewal tokens.
    - **Decided by Nate on 17 Nov:** these two affect access only, so they did not block Phase 1. They were the first task of Phase 2, and must be in and tested before the first friend is invited (spec Section 7, Phase 6). Both are now done (below).
    - **The testing gap.** Both slipped through because the database tests run on a stand-in for Supabase whose sign-in tables allow what real Supabase refuses. Approved by Nate on 17 Nov: run the database and account tests against Supabase's own local version, in GitHub's test runs too; add account tests that hold a renewal token through a reset and that run the clean-up; and test passkey steps with the test browser's built-in stand-in passkey. What only an iPhone can show stays on Nate's checklist in `docs/SETUP.md`. If a beta feature is missing from Supabase's local version, those tests run against a separate test project.
    - **The three iPhone checks** in spec Section 7 (notifications, server-sent rest alerts, screen wake) each needed later screens. Approved by Nate on 17 Nov: a small throwaway test page at the start of Phase 2, before the timers were built on them.
    - **Safe area.** The header sat partly behind the iPhone's camera cut-out, because the app asks the iPhone to draw to the screen's edges (`viewportFit: 'cover'` and a see-through status bar in `src/app/layout.tsx`) and the page left no room for them. Every page now leaves room for the clock, the camera cut-out and the home bar (`src/styles/globals.css`).
    - **What the Phase 2 opening built and found.**
      - **Tests against Supabase's own local version** run in GitHub's test runs, as a second job beside the quick tests (Nate chose GitHub only: nothing is installed on his Mac). They hold real renewal tokens, from a second device and from a coach app connected the way ChatGPT and Claude connect. The passkey steps run in a test browser with its stand-in passkey: register, sign in, and a reset that refuses the old passkey and makes a new one.
      - **What the local version showed.** A device blocked during a reset renewed its sign-in as soon as the block was lifted, as the review feared. Supabase's own "sign out everywhere" ended every device and coach app for good. A renewed pass keeps the moment its sign-in began (the `amr` claim), and so does a coach pass. One difference from the live project: the local version lets the database change Supabase's sign-in tables, which the live project was thought to refuse (point 5). So the local tests cannot settle the clean-up on the live project; a one-line check in `docs/SETUP.md` does.
      - **A reset stays shut.** The server signs the person out everywhere, through Supabase's own sign-out, when the link is made and again when it is opened, just after lifting the block (`src/server/accounts.ts`). That needs a sign-in of the person's own, so the server makes a one-time one, which sends no email and ends with the rest. As a second lock, the database refuses any pass whose sign-in began before the reset, however recently it was renewed (`supabase/migrations/20261117000900_reset_stays_shut.sql`). Passes record times to the whole second, so the cut-off is the start of the next whole second after the reset, and opening the link no longer moves it later (sign-in is blocked until then, so nothing new can appear in between). The review's suggested fix, "sign out others" from the browser after the new passkey is made, was not used: it would rest on the browser running current code, the weakness point 5 already closed for making a reset. A deactivated account cannot be given the one-time sign-in, so for it the database lock does the work.
      - **The 14-day clean-up** works on the local version, run as the scheduler runs it. **On the live project, Nate's check on 17 Nov showed the database is allowed to remove rows from `auth.users`, `auth.sessions` and `auth.refresh_tokens`**, as the scheduler's job needs. So the clean-up stays in the database, as designed. The first real clean-up of a deleted account is its final proof.
      - **Point 5 needs a second look.** It says the live database cannot delete Supabase's renewal tokens. The check shows it has that permission, so the Phase 1 retest failure probably had another cause (most likely the older Admin page that skipped the server's steps, the cause point 5 found next). The reset no longer depends on it either way: Supabase's own sign-out and the database's sign-in-time lock do the work.
      - **Assisted machines and load counts** (point 9) are in the database and the data file (`supabase/migrations/20261117000800_assisted_and_load_count.sql`). **Nate approved every starter exercise's load count on 17 Nov** (`docs/STARTER_LIBRARY.md`), including the one beyond his rule: two cable handles on two weight stacks count 2, like a pair of dumbbells.
      - **The throwaway iPhone test page** (`/app/lab`, `supabase/migrations/20261117001000_iphone_test_page.sql`) tested notifications, the rest alert sent by the server while the app is in the background, screen wake, and the rest sound with music. It added the web app manifest, which an iPhone needs before a home-screen app may get notifications. It was removed on 19 Nov once the real rest alert worked, with its tables, helper and 5-second job (`supabase/migrations/20261119000200_swap_new_exercise_and_remove_test_page.sql`). The web app manifest and pg_net stay, because the real app uses them.
      - **iPhone results (17 Nov).** Notifications work, but a Focus mode holds them back: setup should tell the user how to let Chalk and Iron through. The server-sent rest alert arrived 0.0 seconds late; with a paired Apple Watch worn, a locked phone sends it to the watch, and with another app on screen it shows as a banner on the phone, as an iPhone does for every notification. The screen stays awake, so the silent-video fallback in 10C is not needed. The rest sound: "mix with music" plays over music with the iPhone off silent, including 20 seconds after the tap (so the tap on Log set is enough to unlock the real rest sound), and is muted on silent. Every way a web app can play on silent stops the music, and does not bring it back afterwards. A native app can do better (it asks the iPhone to mix in a way the web cannot).
      - **Decided by Nate on 17 Nov:** the rest sound uses "mix with music" only. It follows silent mode: on silent there is no sound and the banner carries the alert. It never stops music.
    - **Saving, offline sending and crash-safe sessions (18 Nov, an Opus 5.5 high-effort helper).** Workouts and every set are saved to the account through an outbox that survives closing the app and losing the connection, and a set sent twice is saved once (Section 6, "How it is built"). Records are worked out by the database from the sets and again on every edit or delete. "Last time", seeded weights, the graph and record checks come from the account's history. The lb/kg switch and the note are saved to the account, offline too. The real rest alert follows the rest timer (Section 7). A workout finishes itself after 30 minutes with nothing done, on the phone and on the server, and a finished one reopens within 48 hours. Migrations: `…1100_saving_and_offline.sql` and `…1200_rest_alert_and_auto_finish_schedules.sql`. The design's own choices made on the way are listed in Section 5 ("Built in Phase 2"), Section 1 (storage) and Section 7 (late banner).
    - **Fixes from Nate's first iPhone look (19 Nov).** Boxes use 16 px text and the page sets a maximum zoom of 1, so the iPhone no longer zooms in when a box is tapped. The home screen's button reads **Resume** and the workout's name while one is running, otherwise **Start a workout**. Each set row has a visible "⋯" button that opens set details (press and hold still works). The graph labels both scales with their units, and its volume is shown in the exercise's own unit.
    - **Nate's decisions (19 Nov).** (1) **+ Set** beside Skip rest, and the keyboard layout of sketch 3: while a weight or reps box has the keyboard, only the exercise name, a slim clock-and-rest line, the current set, the boxes and Log set show, and the boxes move up under the current set so the keyboard never covers Log set. An iPhone scrolls down to the tapped box before the screen shrinks, so the page is held at the top while the keyboard is up. Nate's rule: if this does not work on the iPhone, the typing layout is removed and the screen goes back to how it was. (2) **Pause**, in the tray: it stops the workout clock and the open exercise's clock and ends any rest and its alert; Resume carries on and paused time is never counted; a paused workout finishes itself after 2 hours paused, not 30 minutes. In the account a paused workout is an active session whose workout clock is stopped (`clock_running_since` empty), so no new column is needed; `supabase/migrations/20261119000100_paused_workouts.sql` gives the server's auto-finish the 2-hour rule. (3) **Sets and rest in the tray**, for today's session only: add a set, remove a set not yet logged (never below one or below what is logged), rest in 15-second steps from 0 to 10 minutes; in a superset they change every member. They change only the session snapshot (`session_exercises.planned_set_types` and `planned_rest_seconds`), never the library, the campaign or other days; a database test checks this. Own choice: on an exercise made by breaking a superset, the budget is worked out again by the one-exercise formula, which is what the break used. (4) **Cardio inside a workout, option A**, with a heart symbol on cardio exercises, and (5) **the daily workout reminder** are recorded in the spec for Phase 5. (6) **Deleting a set does not add a fresh one**, and in a superset it deletes the whole round for every member (Section 6's note on deleting a set). (7) Taking a superset apart from the tray is Break superset (question 41). (8) The "screen colors" Nate expected are the alternate skins and accent colors, in Phase 5 with the Settings screen. Close in the tray, Swap and Stats reads "Return to workout".
    - **Superset box and bracket (Nate, 19 Nov).** While a superset is in play, the exercise panel at the top of the workout (superset label, name, partner and Break superset) sits in a box drawn in the accent color (`.superset-box`, theme tokens only). Its height is unchanged, so nothing below moves. A bracket in the accent color on the left (`.ss-pair`) joins the exercise name to the partner line; it is hidden while typing, when the partner line is hidden too.
    - **The rest of Phase 2 (19 Nov).** One migration, `supabase/migrations/20261119000200_swap_new_exercise_and_remove_test_page.sql`, which must run **before** the app code that uses it (`docs/SETUP.md` step O), because the new app sends a kind of change the account must already know. (1) **The throwaway iPhone test page is removed** (above). (2) **A swap part-way through an exercise.** The rule follows spec Section 10: a change to a running workout applies to sets not yet logged, so the sets logged stay with the exercise they were done on and only the sets left move to the new one. This design's own choices: the new exercise comes right after the original and waits for **Start exercise**, since setting up the new equipment is not counted; it uses its own rest, except in a superset, where the round's rest stays; in a superset the swap waits for the end of a round, and is stored the way a break is stored (the superset as it was keeps its time and budget for the rounds done, the exercise swapped out stays in the workout as done, and the superset carries on with the new member in its place, each member remembering the sets it had before, `session_exercises.sets_before_break`); a swap ends Undo break; it can still be broken apart afterwards; a done or skipped exercise has nothing to swap. (3) **A swap to an alternate not yet in the library.** It joins the library at once with the details question 16 sets out, then the one-tap confirm shows them, with an equipment picker, and **Confirm details** (or **Not now**). Own choices: the new exercise is not assisted and has a load count of 1; if two phones made it at once, the second keeps its own id under the name with " (2)" added, so no set is lost; the original's stored alternate is not linked to it, so a swap never edits the original exercise or makes a proposal about it out of date, and the phone finds the alternate by name; an archived exercise of the same name is not brought back (the phone does not see archived exercises; merging is a later enhancement). (4) **The Home screen's Today panel** (spec Section 5, `src/rules/today.ts`): today's workout from a plan sent to the phone for today, otherwise the active campaign's day with its overrides; its Start button opens the workout screen, which starts it once; **Resume** while a workout runs; **Done today** once it is finished; **Start another workout**; the campaign week Monday to Sunday with Done, Missed, Today, upcoming and Rest; and the number of coach proposals waiting (the inbox itself comes with the coach, Phase 4). A workout started from it is saved as that campaign day (`sessions.source_kind` 'campaign_day'), and a sent plan is marked used. Own choices: missed days are not offered on Home (the coach sees them through `get_today`); with no campaign the panel says so. Until the planner and the coach exist, nothing fills it, so it shows "No workout planned for today".
    - **Swap from the whole library (Nate, 19 Nov).** Under the three alternates, the Swap sheet searches the library, and any exercise found can be picked, with the same rules as an alternate (before or part-way through, in a superset at the end of a round). No database change.
    - **Phase 2 review (20 Nov), a fresh Opus 5.5 session at high effort.** Solid: the part-way swap in a superset (per-member `Block.bases`, saved in `session_exercises.sets_before_break`) and its round trip through the account, the copy of `app.apply_one_change` in migration `…19000200` (faithful: only the today-plan line and the two new kinds were added), per-person isolation on every new path, and the outbox's exactly-once sending. **Found, and fixed at Nate's choice** (tests in `tests/rules/phase2-review.test.ts` and `tests/db/swap.test.ts`; no database change): (1) Skip on an exercise part-way through left its done sets out of "sets done" and efficiency. Now they count as normal, and only the sets left are left out; the exercise still shows Skipped, with its sets (spec Section 10; Nate, 20 Nov). (2) Undo break added the clock time of any superset broken or swapped earlier in the workout to that superset, and counted the time between the break and the undo twice; it also undid what had happened to other exercises since the break and dropped an exercise added since. Now it changes back only the superset it broke and the blocks that break made. (3) Moving an exercise in the tray after a break or a superset swap could trade places with a hidden block, so the first tap did nothing; with no connection, two swaps or breaks in a row and a move up could put a block ahead of the one it was made from, which the account refused, and later sets were not saved. Now a move passes over hidden blocks, and each hidden block is kept just before the first block made from it. (4) A warm-up switch did not grow the budget of an exercise made by a break, or of any broken-out or swapped block after resuming on another device. Now only a closed block keeps a fixed budget; every other block's budget follows its sets. (5) A workout that finished itself while paused reopened looking paused with its clock running. Finishing now clears the pause. (6) + Set and the warm-up switch had no limit, but the account keeps at most 24 sets an exercise and refused the whole workout past that. Both stop at 24. (7) After a part-way swap in a superset, the Delete confirmation for a set from before the swap said the round would be removed from every exercise, though only that exercise's set is removed. It now says so.
    - **Warm-up in the set details sheet (Nate, 20 Nov; no database change).** Choosing Warm-up in the sheet only changed the label on one exercise, while tapping the row added a working set and grew the budget. Nate decided the two must be the same. `setDetails` in `src/rules/session.ts` sends any move into or out of warm-up through `toggleSet`, so the rule lives in one place: it adds or removes the set, switches the whole round in a superset, keeps the break and part-way-swap rules and the 24-set limit, and grows or shrinks the budget. If the change is refused (at 24 sets), the set keeps its type. Drop set and RPE stay label-only; warm-up to drop set first undoes the warm-up, then sets the label. The **⋯** button stays. Tests: `tests/rules/warmup-sheet.test.ts`.

Choices the build made within the design:

- Deactivating an account blocks it twice: the database shows it nothing (including its coach), and the server also blocks sign-in in Supabase.
- An invite or reset link carries its secret after "#", so opening the link never sends the secret to the server or its logs.
- The first admin is made by a one-time invite (`scripts/bootstrap-admin.mjs`) that works only while the app has no accounts.
- The tests run on a local in-memory Postgres with a small stand-in for Supabase's sign-in schema (`tests/db/`), because there was no Supabase project when Phase 1 began. The same migrations then run on the real project. The Phase 1 review found this stand-in too lenient (point 10).

### D. Carried from the kickoff brief

The items still open (the Coach button opening a ChatGPT project, default work and rest seconds with no researched source, the parked coach instructions) are kept in `docs/NEXT.md`, under Open items. Answered: Claude works as a coach through the same connector (17 Nov, the sign-in proof), on the web, in a Project and in the iPhone app.

---

## 11. Phase 4: stages of work (24 Nov 2026)

**In short:** Phase 4 is built in eight stages, one pull request each, in this order. Each ends with its tests passing and, where it says so, a check by Nate on the live app (steps added to `docs/SETUP.md` as each stage is built). Stages 4C and 4D touch different files and can run side by side. The model for each follows `docs/MODEL_AND_EFFORT.md`, Phase 4.

| Stage | Model | What it builds | Done when | Nate's part |
|---|---|---|---|---|
| 4A. Data and the lock | Opus 5.5, high | The new fields and table: the coach intake, `decline_reason`, `weekly_checkins` with `record_weekly_checkin`. The database refuses every coach write except adding proposals and their targets and recording a check-in. How the eval data is loaded | The database and isolation tests pass for every new field and table, on Supabase's own local version too | Runs the SQL step on the live project |
| 4B. Connector core | Opus 5.5, high | The real connector at its permanent link, with the proof's sign-in kept (a per-call check, passes only from this project). The error shape, size limits, too-many-requests, the one-minute repeat guard, the call log. The connector's instructions. The first read tools: `get_profile`, `list_gyms`, `get_vocabulary`. Deletes `phase0/` and `proofs/connector-signin/` | Connector, isolation and sign-in tests pass | Connects ChatGPT and Claude to the real link and asks each "who am I?" |
| 4C. The other read tools | Sonnet 5.5, medium | The other eleven read tools, including the weekly summary with check-in recording, `list_proposals` with decline reasons, and `list_cardio` | Contract and isolation tests pass for every read tool; agent pass on E9, E15, E16 and E18 | None |
| 4D. Accept and Decline | Opus 5.5, high | The payload for each kind of proposal. Accept for all five kinds, all or nothing: targets and out of date, bundled new exercises and workouts, a change to today inside a running workout or in today's plan (including breaking a superset), a new campaign as a draft, profile and gym. Decline with its reason. The 3:00 am expiry | Database tests pass for every Accept and Decline test in spec Section 8, including a phone that was offline | Runs the SQL step (AM) |
| 4E. Propose tools | Sonnet 5.5, medium | The five propose tools: every check, errors written to the coach, tool descriptions from the brief, and the description code check | Every validation test passes; agent pass on E3, E4, E5, E17 and E19 | None |
| 4F. The inbox | Sonnet 5.5, medium | The coach's cards on the phone and on the planner's new Proposals screen (with room for a full campaign), the Coach button's count, the banner after Accept, Decline with its optional reason, out-of-date and expired cards shown | Browser tests pass | Accepts and declines a coach card on the iPhone and in the planner |
| 4G. Coach setup, Profile and gyms | Sonnet 5.5, medium | Coach setup in order: intake, ChatGPT and Claude steps with screenshots, the instructions to copy, the connection test, "let's get started". The coach link and connected coach apps with Disconnect. Profile and gyms with the intake's answers | Browser tests pass | Completes Coach setup on the eval account using only the page |
| 4H. Home and the full eval | Sonnet 5.5, medium | Home's last-week note and check-in marks with the count. The coach instructions brought in line with the brief and the final tool names (Nate's own revision of the wording still waits for real use). The full agent pass | Every Phase 4 acceptance test passes; the agent pass passes E1 to E19 | Runs the client pass |
| Review | Opus 5.5, high, fresh | The phase review, as for every phase. Fixes after it are checked by a fresh Opus 5.5 high session unless Nate waives it | The review's points are settled | Accepts Phase 4 |

## What happens next

1. Nate answered every row of the decisions table on 16 November, and Section 10 on 17 November. Both sets of answers are recorded in this document, and the spec is updated wherever an answer changes a product rule.
2. Every question in Section 10 is answered. The few small details once marked "awaiting Nate's confirmation" were accepted with the design's approval on 17 Nov, and stand unless Nate changes them:
   - question 12: "the heaviest previous set" means last session's; a planned weight wins over the seed; the box is empty the first time; reps are pre-filled from the plan;
   - question 14: a workout's bodyweight volume shows as its own figure beside the pounds total;
   - question 39: Skip inside a superset skips the whole superset;
   - question 41, breaking a superset during a workout: the five details that are this design's own choices, listed in that row.
3. Nate approved this design on 17 November 2026. What is being built now is in `docs/NEXT.md`; what was done, by date, is in `docs/LOG.md`.

### Screen fixes (27 Nov, Sonnet 5.5, medium)

- **The workout's + and − buttons.** The Coach setup step boxes used the class `step`, which also matched the workout's `btn step` buttons and made each a column with its label at the top. The setup boxes are now `setup-step`. A browser test compares each button's centre with its number's centre on a phone and a desktop width.
- **Start another workout** (`/app/workout` with nothing running) shows two choices. **Pick a workout** is a search box over the saved workouts, with the eight most recently started first (from `sessions.workout_id` and `started_at`, newest 500 sessions read) and the rest A to Z; a search shows matches A to Z. **Ad-hoc workout** (formerly "Quick workout") is the exercise picker, with **Start workout** above the list. An ad-hoc session is still saved with source `ad_hoc`; the database is unchanged. "Off-plan workout" is the general term (spec Section 1).
- **The planner's Menu** (`src/app/planner/(shell)/shell.tsx`): four tabs (Plan, Library, History, Proposals) that never wrap; a Menu button holds Vocabulary, Coach setup, Profile and gyms, Account, Admin (read from `profiles.is_admin` in the layout), Phone home and the lb/kg switch. It closes on choosing, Escape or a click outside.
