# Setting up the real app

17 November 2026, updated 19 November 2026 · Phase 1 and Phase 2 · For Nathan

The Phase 1 foundation was accepted by Nathan and merged on 17 November 2026. It runs at https://chalkandiron.vercel.app on the real Supabase project `chalk-and-iron`, built from `main`. Your account and a test account are set up. This page records how it was set up, in order, and the checks still to tick.

## 1. Run the sign-in proof first (done 17 November 2026)

Follow `proofs/connector-signin/README.md`. It uses **throwaway** Supabase and Vercel projects, separate from the real ones. It settles whether ChatGPT and Claude can sign in to the connector, and whether a passkey alone works on your iPhone, in Safari and as a home-screen app. Record the results in its checklist and tell the coding agent.

**Result:** it passed on 17 November 2026 (design Section 10E). The only check left is that a coach pass renews itself the next day. Once that is recorded, delete the throwaway Supabase and Vercel projects. Deleting them also frees the Supabase free-plan slot for the real project.

## 2. Then set up the real app

The proof has passed, and the permanent address is chosen (below). The Vercel project `chalkandiron` was created on 17 November 2026 with Vercel Authentication off.

### The permanent address (decided 17 November 2026)

The app's permanent address is **https://chalkandiron.vercel.app**, chosen by Nathan on 17 November 2026. A passkey is tied to one web address. If the address changes later, every passkey made before the change stops working, and every coach connection has to be redone. So this address stays.

It was chosen in two steps on the same day. Nathan first picked `https://chalkandiron-trantelica.vercel.app`, because the short address looked taken: it showed "not found", and Vercel refused to add it a second time. In fact it already belonged to his own project and had simply not been built yet. Nathan then switched to the short address. Both accounts made new passkeys through reset links, and the long address now forwards to the short one (`REDIRECT_FROM_HOSTS`). Invite and reset links always use `NEXT_PUBLIC_APP_ORIGIN`.

### A. Supabase (about 15 minutes)

1. Create a new Supabase project on the free plan, named `chalk-and-iron`.
2. **Settings > JWT Keys.** Make sure the key is the newer ECC (P-256) kind, as in the proof (step A2 there).
3. **Authentication > URL Configuration.** Set the Site URL to `https://chalkandiron.vercel.app`.
4. **Authentication > Passkeys** (or Sign In / Providers). Turn passkeys on. Relying Party Display Name: `Chalk and Iron`. Relying Party ID: `chalkandiron.vercel.app`. Relying Party Origins: `https://chalkandiron.vercel.app`.
5. **Authentication > Sign In / Providers > Email.** Turn off "Allow new users to sign up". Accounts are made only from invite links, by the app's server.
6. **SQL Editor.** Paste and run each file in `supabase/migrations/`, in name order: `…0100_foundation.sql`, `…0200_accounts.sql`, `…0300_schedules.sql`, `…0400_reset_cuts_off_at_once.sql`, `…0500_reset_only_through_server.sql`, `…0600_starter_library_v2.sql`, then `…0700_bands_are_bodyweight.sql`. If the third says the scheduler extension is missing, turn on **pg_cron** under Database > Extensions and run it again.
   **If your project is already set up** (as `chalk-and-iron` is): run only the new file, `…0600_starter_library_v2.sql`. It brings accounts made with the first 42 exercises up to the 227 of starter library version 2. Run it after the app has been rebuilt with version 2, so no account is made with the old 42 in between. If one is, run it again: a second run changes only what is still missing. It ends with a table showing, for each account, how many details were updated, exercises added and swaps linked. A first run on an account untouched since registration shows 185 exercises added.
   **Then run `…0700_bands_are_bodyweight.sql`** (added 17 November 2026). It makes the 14 band exercises bodyweight in every existing account, because band resistance is not standardized. It ends with a table: each account should show 14 switched and 0 left alone. Run it after the app has been rebuilt from this branch, so no new account is made with bands in pounds. If one is, run it again: a second run changes nothing else.
7. **Settings > API Keys.** Keep the project URL, the publishable key and the secret key ready for step B3. The project URL is the bare address, like `https://abcd1234.supabase.co`, with no `/rest/v1` on the end. The secret key starts `sb_secret_`. A public key in its place gives the error "This endpoint requires a valid Bearer token".

The OAuth server for the coach connection is switched on in Phase 4, when the real connector is built.

### B. Vercel (about 10 minutes)

1. Done: the project `chalkandiron` exists, linked to the repository, framework Next.js, Vercel Authentication off. It was built from the `phase-1-foundation` branch until Phase 1 was merged on 17 November 2026, and is built from `main` since.
2. Done: its address is the permanent one above.
3. **Settings > Environment Variables**, names only here, values from Supabase:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`, which is never pasted anywhere else
   - `NEXT_PUBLIC_APP_ORIGIN`: `https://chalkandiron.vercel.app`
   - `REDIRECT_FROM_HOSTS`: `chalkandiron-trantelica.vercel.app`
4. Deploy.

### C. Your admin account

1. The first admin invite is made once with `scripts/bootstrap-admin.mjs`. This needs a terminal with the secret key, so it is easiest to ask the coding agent to run it with you. It prints a link that works once.
2. Open the link on your iPhone in Safari, type your name and email, and create your passkey.
3. Add the app to your home screen, open it from there, and sign in with Face ID.

### D. Checks on your iPhone

Tick each one and tell the coding agent. **All ticked by Nathan on 17 November 2026**, after running `…0700_bands_are_bodyweight.sql`. Phase 1 has no screen that lists exercises, only the count on the home screen ("Your library holds 227 exercises"). So the two library checks below rest on that count and on the reports the two updates print in the SQL Editor, not on seeing the exercises themselves. Browsing the library, with each exercise's details, arrives with the planner in Phase 3 (`docs/SPEC.md` Section 7). The Phase 1 review added two account checks that come with the Phase 2 fixes (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10).

- [x] The invite link registers you, and the passkey is created.
- [x] Signing out and back in with Face ID works in Safari.
- [x] The same works in the home-screen app.
- [x] The admin page lists your account and makes an invite with ready-to-paste text.
- [x] A second test account (a second email of yours) registers from that invite and sees its own 227 exercises, and the admin page shows it.
- [x] After running `…0600_starter_library_v2.sql`, your own account shows 227 exercises, and "Plate-Loaded Machine Leg Press" is now "Plate-Loaded Machine Angled Leg Press" (one leg press, not two).
- [x] After running `…0700_bands_are_bodyweight.sql`, a band exercise such as Band Curl shows as bodyweight (BW).
- [x] Deactivating the test account stops it signing in. Reactivating lets it back in.
- [x] Making a reset link for the test account signs it out at once, and its old passkey stops working, before the link is opened.
- [x] Opening the reset link makes a new passkey and shows the reset notice.

## 3. The start of Phase 2 (17 November 2026)

The opening items of Phase 2 are on pull request #7 (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10). These steps follow once it is merged into `main`, which rebuilds the live app.

### E. The load counts (approved 17 November 2026)

Nathan approved the proposed load count for every starter exercise ("Load counts" in `docs/STARTER_LIBRARY.md`). Nothing to do here.

### F. Supabase SQL Editor, in this order

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. For each file below: open its link (they work once pull request #7 is merged), click the **Copy raw file** button (two overlapping squares, top right of the file), paste into the empty query, and click **Run**.

1. [`20261117000800_assisted_and_load_count.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261117000800_assisted_and_load_count.sql). It adds the assisted flag and the load count to every exercise and sets them for the starter exercises in every account. It ends with a table: an account untouched since registration shows 83 exercises set. A second run sets nothing.
2. [`20261117000900_reset_stays_shut.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261117000900_reset_stays_shut.sql). The database lock that keeps a reset shut after its link is opened.
3. [`20261117001000_iphone_test_page.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261117001000_iphone_test_page.sql). Throwaway: the iPhone test page's two tables and a job that runs every 5 seconds. It turns on pg_net. If it says pg_net or pg_cron is missing, turn it on (left-hand menu **Database**, then **Extensions**, search for it and switch it on) and run the file again.
4. **The clean-up check.** In a **New query**, paste and run this one line. It changes nothing; it only asks whether the database may remove a deleted account's sign-in record, as the daily clean-up must:

   `select t as "table", has_table_privilege(t, 'DELETE') as allowed from unnest(array['auth.users', 'auth.sessions', 'auth.refresh_tokens']) t;`

   Tell the coding agent what the "allowed" column shows. If `auth.users` says false, the clean-up moves to the app's server before the first friend is invited.

   **Done 17 November 2026:** merged, all three files run (the iPhone test page file shows the scheduler's job number, 2), and the check showed **true** for all three, so the clean-up stays as it is.

### G. Vercel: the notification keys

Notifications need a pair of keys. The public one goes in the app; the private one stays in Vercel. **Where:** https://vercel.com, the project `chalkandiron`, then **Settings**, then **Environment Variables**. Two environment variables, values from the coding agent (never pasted anywhere else): `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Then redeploy: **Deployments** tab, the top deployment's **⋯** menu, **Redeploy**.

**Done 17 November 2026** by the coding agent, at Nathan's request: a new key pair was made, both were added for Production and Preview (the private one marked Sensitive, so Vercel never shows it again), no copy was kept anywhere else, and the live app was rebuilt.

### H. On your iPhone

1. The app now tells the iPhone it is a full home-screen app, which notifications need. Delete the Chalk and Iron icon from your home screen, open https://chalkandiron.vercel.app in Safari, Share > Add to Home Screen, and open it from there. Your passkey and data are unaffected.
2. Check the safe area: the heading no longer sits behind the camera cut-out or runs into the clock, and nothing sits on the home bar. *(17 Nov: pass.)*
3. Tap **iPhone checks** on the home screen and work down the page. Tell the coding agent what happened at each step:
   - [x] **Notifications.** Allow, then "Send one now". A notification appears. *(17 Nov: pass, once Focus mode was off. A Focus mode holds them back.)*
   - [x] **Rest alert, phone locked.** Start a 30-second rest and lock the phone. "Rest over" arrives when the rest ends. Note how late it says it was. *(17 Nov: pass. With the Apple Watch on, a locked phone sends it to the watch. 0.0 seconds late.)*
   - [x] **Rest alert, another app open.** The same, with another app on screen instead. *(17 Nov: pass. A banner on the phone, not on the watch, as an unlocked iPhone does.)*
   - [x] **Screen stays awake.** With Keep awake on, the screen stays on past the Auto-Lock time. *(17 Nov: pass.)*
   - [x] Extra: **the rest sound with music.** *(17 Nov: "mix with music" plays over music off silent, including 20 seconds after the tap, and is muted on silent. Every way of playing on silent stops the music. Nathan decided the sound follows silent mode and the banner carries the alert.)*
4. **Reset retest.** **All passed, 17 November 2026.** Your own account makes the link; your test account (the second email) is the one reset. Three windows:
   - **Mac, window 1, your own account:** in Chrome (or any browser where you are signed in as yourself), open https://chalkandiron.vercel.app/planner/admin.
   - **Mac, window 2, the test account:** in Safari, choose **File > New Private Window**, open https://chalkandiron.vercel.app/signin, tap **Sign in** and pick the test account's passkey. You land on the home screen.
   - **iPhone, the test account:** in **Safari** (not the home-screen icon, which is your own account), open https://chalkandiron.vercel.app/signin and sign in with the test account's passkey.
   - [x] In window 1, find the test account in the accounts table and click **Reset sign-in**, then **OK**. Copy the link from the text that appears and send it to yourself (for example in Messages to your own number).
   - [x] Within a few seconds, reload window 2 and the iPhone's Safari page. Both are sent to the sign-in page.
   - [x] On the iPhone, open the reset link in Safari and make the new passkey. You see the reset notice and the home screen.
   - [x] Reload window 2 on the Mac. It stays on the sign-in page. (Do not sign in again there: the new passkey may have copied itself to the Mac through iCloud, and would rightly work.)


## 4. Phase 2: saving workouts and sending them later (18 November 2026)

Built on the `phase-2-saving-and-offline` branch (`docs/TECHNICAL_DESIGN.md` Sections 6 and 7). These steps follow once its pull request is merged into `main`, which rebuilds the live app.

### I. Supabase SQL Editor, in this order

**Run these as soon as the pull request is merged.** Until the first one is run, the phone keeps every workout on the phone and its line reads "No connection"; nothing is lost, and everything is sent once the file is run.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. For each file below: open its link (they work once the pull request is merged), click the **Copy raw file** button (two overlapping squares, top right of the file), paste into the empty query, and click **Run**.

1. [`20261117001100_saving_and_offline.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261117001100_saving_and_offline.sql). Saving workouts and sets to the account, the one door phones send changes through, records worked out by the database, history for the phone, and the 30-minute auto-finish. It adds a few columns and rules; it removes no table and deletes no data. It should end with "Success. No rows returned".
2. [`20261117001200_rest_alert_and_auto_finish_schedules.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261117001200_rest_alert_and_auto_finish_schedules.sql). Two scheduled jobs: the real rest alert (every 5 seconds) and the auto-finish (every minute). It ends with a small table showing the scheduler's job numbers. The iPhone test page's own job keeps running until that page is removed.

### J. On your iPhone

Open Chalk and Iron from its home-screen icon, and tap **Start a workout** (it reads **Resume** and the workout's name while one is running). Tell the coding agent what happened at each step.

1. [x] **Turn on rest alerts.** Tap **Turn on rest alerts**, then **Allow**. (The iPhone checks page's permission does not carry over: each phone turns on rest alerts once, here.) The line under it says "Rest alerts are on for this phone."
2. [x] **Start and save.** Under **Quick workout**, type `Barbell Curl` in the search box, tap **Barbell Curl**, then **Start workout**. Tap **Start exercise**, type a weight, and tap **Log set**. The line under the workout clock reads **Saved to your account**.
3. [x] **Rest alert, phone locked.** Log a second set, then lock the phone at once. When the 90-second rest ends, "Rest over / Time for your next set." arrives (on the Apple Watch if you wear it). Tap it: the app opens on Barbell Curl, with set 3 marked Now.
4. [x] **Rest end with the app open.** Log a set and keep the app on screen. When rest ends you see the "Rest over" banner and no notification.
5. [x] **+0:15 and Skip.** Log a set, tap **+0:15**, and lock the phone: the notification comes 15 seconds later than the rest would have ended. Log another, tap **Skip rest**, and lock the phone: no notification comes.
6. [x] **Offline.** Swipe down from the top-right corner and turn on **Airplane Mode**. Log two sets. The line reads "No connection. … saved on this phone, sent when you are back online." Turn Airplane Mode off. Within a few seconds the line reads **Saved to your account**.
7. [x] **Close and reopen.** Swipe up from the bottom of the screen and hold, then swipe Chalk and Iron away. Wait a minute and open it again. You are back on the same exercise, with the same sets done, and the workout clock kept counting while it was closed.
8. [x] **lb/kg and the note.** On the workout screen tap **kg**, and type something in the note line under the exercise name. Close and reopen the app as in step 7: kg and the note are still there.
9. [x] **Edit and delete a set.** Press and hold a done set. Change its reps and tap **Save**. Press and hold it again, tap **Delete this set**, then **Yes, delete set …**. It disappears, and the set after it moves up.
10. [x] **Finish and reopen.** Open the tray (**Workout** at the top), tap **Finish workout**, then **Finish workout** again. The finished screen says **Saved to your account.** Tap **Reopen workout**: the workout carries on, and the time it was closed is not counted. Finish it again and tap **Done**.
11. [x] **Last time.** Start another quick workout with Barbell Curl. "Last time" shows the sets you just logged, and the weight box is filled with them. Finish or leave it.
12. [x] Optional, **a second device.** On the Mac, sign in at https://chalkandiron.vercel.app/signin, tap **Start a workout**, and start a quick workout while one is running on the iPhone. It says "A workout is already running", with **Carry on with it here** and **Finish it, and start this one**.

**Nathan's results, 19 November 2026:** all twelve passed. Notes: step 6 passed, but the offline line was cut off (fixed: it now wraps and is shorter). Step 9 passed, and deleting a set added a set to do at the end. Nathan decided it should not: from the next merge, deleting a set removes it with no fresh set added, a set still to do can be deleted too, and in a superset Delete removes that whole round for every exercise in it. Step 10 passed, but the finished screen said "Saved to your account" twice (fixed).

Once step 3 passes, the throwaway iPhone checks page and its two tables can be removed. The coding agent does that with a new migration, and tells you first, since it deletes the test page's tables. **Done 19 November 2026** (section 6 below).

## 5. Phase 2: Add set, Pause, and sets and rest in the tray (19 November 2026)

Built on the `phase-2-add-set-pause-tray` branch (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10).

### K. Supabase SQL Editor

**Run this as soon as the pull request is merged.** Until it is run, everything works except that a workout left paused finishes itself after 30 minutes instead of 2 hours.

Open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [`20261119000100_paused_workouts.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261119000100_paused_workouts.sql). It should end with "Success. No rows returned". Safe to run more than once.

### L. On your iPhone

Open Chalk and Iron from its home-screen icon. If it looks unchanged, swipe it away and open it again.

1. [x] **+ Set.** Start a workout and tap **Start exercise**. Tap **+ Set** (beside Skip rest). A new set appears at the end of the list and the Budget grows. In a superset, both exercises gain a set.
2. [x] **Typing.** Tap the weight box. The screen shrinks to the exercise name, a clock line, the current set, the two boxes and **Log set**, all above the keyboard. Type a weight and tap **Log set** once: the set is logged and the full screen comes back.
3. [x] **Pause.** Open the tray (**Workout** at the top) and tap **Pause workout**. The workout clock reads **Paused** and stops. Close the tray: a **Workout paused** panel shows. Wait a minute and tap **Resume workout**: the clocks carry on from where they stopped.
4. [x] **Pause during rest.** Log a set so rest starts, then pause. Rest ends at once and no "Rest over" notification comes.
5. [x] **Sets and rest in the tray.** In the tray, tap **+** and **−** beside **Sets** (or **Rounds** for a superset), and beside **Rest**. The boxes for that exercise change, and the next rest uses the new time. Your library workout is not changed.

**Nathan's results, 19 November 2026:** all five passed. Step 2: the screen shrank, but the empty space above stayed and he had to scroll up. Fixed the same day: while the keyboard is up the page is held at the top, so the boxes and Log set sit just under the exercise name. If it still leaves a gap on the iPhone, the typing layout is turned off and the screen goes back to how it was before (Nathan, 19 Nov). Step 5: the library cannot be seen on the phone yet, so a database test now checks that adding and removing sets and changing rest leave the library workout and the exercise exactly as they were. Also changed: the tray, Swap and Stats close with **Return to workout**.

### M. On your iPhone, after the next merge

1. [x] **Typing, again.** Start a workout and scroll down so the weight box is near the bottom of the screen. Tap it. The screen shrinks with no empty space above: the exercise name is at the top and **Log set** is just above the keyboard, with no scrolling needed.
2. [x] **Return to workout.** Open the tray, Swap and Stats in turn. Each closes with **Return to workout**.
3. [x] **Delete a superset round.** In a superset, log one set, tap **⋯** on that round's row and **Delete round 1**. The round leaves both exercises and no round is added.

**Nathan's results, 19 November 2026:** all three passed. An account cannot make a superset until the planner (Phase 3), so a "Superset test" workout was added to his account once through the SQL Editor for check 3. Nathan then asked for a box around the superset header (step N).

### N. On your iPhone, after the next merge

1. [ ] **Superset box.** Start **Superset test**. The panel with "Superset A1 of 2", the exercise name and **Break superset** sits inside a box in the accent color. Move to **Cable Lat Pulldown**: no box. Tap **Break superset** on a superset: the box goes away.
2. [ ] **Superset bracket.** In the same box, a bracket in the accent color on the left joins the exercise name to the "Then …" or "With …" line below it. It goes away with the box.

## 6. Phase 2: the last items before the review (19 November 2026)

Built on the `phase-2-swap-today-cleanup` branch (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10): the iPhone checks page removed, a swap part-way through an exercise, a swap to an alternate not yet in your library, and the Home screen's Today panel.

### O. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** The new app sends the account a new kind of change when a swap adds an exercise. If the app arrived first, that change would be refused, and the workout changes after it with it. Run before merging, nothing changes for the app you have now, except that the old **iPhone checks** page stops working, which is the point.

**What it deletes:** the iPhone checks page's two tables (its notification addresses, and its test rest alerts), its helper and its 5-second scheduled job. Your workouts, sets, library, account and the real rest alerts are not touched.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261119000200_swap_new_exercise_and_remove_test_page.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261119000200_swap_new_exercise_and_remove_test_page.sql). It should end with "Success. No rows returned". Safe to run more than once.
2. [x] To check: in a new query, paste `select count(*) from cron.job where jobname = 'lab-rest-alerts';` and click **Run**. It shows **0**.

**Done 19 November 2026:** Nathan ran the file before the merge. Pull request 22 was then merged into `main` at his request, after GitHub's checks passed.

### P. On your iPhone, after the merge

Open Chalk and Iron from its home-screen icon. If it looks unchanged, swipe it away and open it again.

1. [ ] **Home.** The **iPhone checks** button is gone. A **Today** panel shows today's date and "No workout planned for today", with **Start another workout** (planned days arrive with the planner). While a workout runs, it shows **Resume** and the workout's name instead.
2. [ ] **Swap part-way.** Start a quick workout with `Barbell Bench Press`, tap **Start exercise** and log one set. Tap **Swap**. The sheet says the 1 set you logged stays with Barbell Bench Press and the 2 sets left are done as the exercise you pick. Tap **Dumbbell Bench Press**. The screen moves to Dumbbell Bench Press with 2 sets and **Start exercise**. Open the tray (**Workout** at the top): Barbell Bench Press shows **Done** with its one set, and Dumbbell Bench Press comes right after it.
3. [ ] **Swap in a superset.** Start **Superset test**, tap **Start exercise** and log one full round (a set on each exercise). Tap **Swap** and pick an alternate. The superset carries on with the new exercise in its place for the rounds left, still alternating. Part-way through a round, the sheet says to finish the round first.
4. [ ] **Swap to an exercise not in your library.** Every alternate in the starter library is already in your library, so this one shows only once the planner can archive or rename exercises (Phase 3). The test browser on GitHub checks it meanwhile: the new exercise is added at once, "Added to your library" shows its suggested details with an equipment picker, and **Confirm details** saves them.
