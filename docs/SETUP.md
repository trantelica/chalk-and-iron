# Setting up the real app

17 November 2026, updated 19 November 2026 · Phase 1 and Phase 2 · For Nate

The Phase 1 foundation was accepted by Nate and merged on 17 November 2026. It runs at https://chalkandiron.vercel.app on the real Supabase project `chalk-and-iron`, built from `main`. Your account and a test account are set up. This page records how it was set up, in order, and the checks still to tick.

## 1. Run the sign-in proof first (done 17 November 2026)

Followed the proof's own steps ([`proofs/connector-signin/README.md`](https://github.com/trantelica/chalk-and-iron/blob/0852e08/proofs/connector-signin/README.md), removed in stage 4B and kept in the repository's history). It used **throwaway** Supabase and Vercel projects, separate from the real ones. It settles whether ChatGPT and Claude can sign in to the connector, and whether a passkey alone works on your iPhone, in Safari and as a home-screen app. Record the results in its checklist and tell the coding agent.

**Result:** it passed on 17 November 2026 (design Section 10E). The last check, that a coach pass renews itself without a new sign-in, passed on 20 November 2026. Delete the throwaway Supabase and Vercel projects. Deleting them also frees the Supabase free-plan slot for the real project.

## 2. Then set up the real app

The proof has passed, and the permanent address is chosen (below). The Vercel project `chalkandiron` was created on 17 November 2026 with Vercel Authentication off.

### The permanent address (decided 17 November 2026)

The app's permanent address is **https://chalkandiron.vercel.app**, chosen by Nate on 17 November 2026. A passkey is tied to one web address. If the address changes later, every passkey made before the change stops working, and every coach connection has to be redone. So this address stays.

It was chosen in two steps on the same day. Nate first picked `https://chalkandiron-trantelica.vercel.app`, because the short address looked taken: it showed "not found", and Vercel refused to add it a second time. In fact it already belonged to his own project and had simply not been built yet. Nate then switched to the short address. Both accounts made new passkeys through reset links, and the long address now forwards to the short one (`REDIRECT_FROM_HOSTS`). Invite and reset links always use `NEXT_PUBLIC_APP_ORIGIN`.

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

The OAuth server for the coach connection is switched on in Phase 4, when the real connector is built (step AJ).

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

Tick each one and tell the coding agent. **All ticked by Nate on 17 November 2026**, after running `…0700_bands_are_bodyweight.sql`. Phase 1 has no screen that lists exercises, only the count on the home screen ("Your library holds 227 exercises"). So the two library checks below rest on that count and on the reports the two updates print in the SQL Editor, not on seeing the exercises themselves. Browsing the library, with each exercise's details, arrives with the planner in Phase 3 (`docs/SPEC.md` Section 7). The Phase 1 review added two account checks that come with the Phase 2 fixes (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10).

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

Nate approved the proposed load count for every starter exercise ("Load counts" in `docs/STARTER_LIBRARY.md`). Nothing to do here.

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

**Done 17 November 2026** by the coding agent, at Nate's request: a new key pair was made, both were added for Production and Preview (the private one marked Sensitive, so Vercel never shows it again), no copy was kept anywhere else, and the live app was rebuilt.

### H. On your iPhone

1. The app now tells the iPhone it is a full home-screen app, which notifications need. Delete the Chalk and Iron icon from your home screen, open https://chalkandiron.vercel.app in Safari, Share > Add to Home Screen, and open it from there. Your passkey and data are unaffected.
2. Check the safe area: the heading no longer sits behind the camera cut-out or runs into the clock, and nothing sits on the home bar. *(17 Nov: pass.)*
3. Tap **iPhone checks** on the home screen and work down the page. Tell the coding agent what happened at each step:
   - [x] **Notifications.** Allow, then "Send one now". A notification appears. *(17 Nov: pass, once Focus mode was off. A Focus mode holds them back.)*
   - [x] **Rest alert, phone locked.** Start a 30-second rest and lock the phone. "Rest over" arrives when the rest ends. Note how late it says it was. *(17 Nov: pass. With the Apple Watch on, a locked phone sends it to the watch. 0.0 seconds late.)*
   - [x] **Rest alert, another app open.** The same, with another app on screen instead. *(17 Nov: pass. A banner on the phone, not on the watch, as an unlocked iPhone does.)*
   - [x] **Screen stays awake.** With Keep awake on, the screen stays on past the Auto-Lock time. *(17 Nov: pass.)*
   - [x] Extra: **the rest sound with music.** *(17 Nov: "mix with music" plays over music off silent, including 20 seconds after the tap, and is muted on silent. Every way of playing on silent stops the music. Nate decided the sound follows silent mode and the banner carries the alert.)*
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

**Nate's results, 19 November 2026:** all twelve passed. Notes: step 6 passed, but the offline line was cut off (fixed: it now wraps and is shorter). Step 9 passed, and deleting a set added a set to do at the end. Nate decided it should not: from the next merge, deleting a set removes it with no fresh set added, a set still to do can be deleted too, and in a superset Delete removes that whole round for every exercise in it. Step 10 passed, but the finished screen said "Saved to your account" twice (fixed).

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

**Nate's results, 19 November 2026:** all five passed. Step 2: the screen shrank, but the empty space above stayed and he had to scroll up. Fixed the same day: while the keyboard is up the page is held at the top, so the boxes and Log set sit just under the exercise name. If it still leaves a gap on the iPhone, the typing layout is turned off and the screen goes back to how it was before (Nate, 19 Nov). Step 5: the library cannot be seen on the phone yet, so a database test now checks that adding and removing sets and changing rest leave the library workout and the exercise exactly as they were. Also changed: the tray, Swap and Stats close with **Return to workout**.

### M. On your iPhone, after the next merge

1. [x] **Typing, again.** Start a workout and scroll down so the weight box is near the bottom of the screen. Tap it. The screen shrinks with no empty space above: the exercise name is at the top and **Log set** is just above the keyboard, with no scrolling needed.
2. [x] **Return to workout.** Open the tray, Swap and Stats in turn. Each closes with **Return to workout**.
3. [x] **Delete a superset round.** In a superset, log one set, tap **⋯** on that round's row and **Delete round 1**. The round leaves both exercises and no round is added.

**Nate's results, 19 November 2026:** all three passed. An account cannot make a superset until the planner (Phase 3), so a "Superset test" workout was added to his account once through the SQL Editor for check 3. Nate then asked for a box around the superset header (step N).

### N. On your iPhone, after the next merge

1. [x] **Superset box.** Start **Superset test**. The panel with "Superset A1 of 2", the exercise name and **Break superset** sits inside a box in the accent color. Move to **Cable Lat Pulldown**: no box. Tap **Break superset** on a superset: the box goes away.
2. [x] **Superset bracket.** In the same box, a bracket in the accent color on the left joins the exercise name to the "Then …" or "With …" line below it. It goes away with the box.

**Nate's results, 19 November 2026:** both passed. He approved the box and bracket ("That looks really good. This is approved.").

## 6. Phase 2: the last items before the review (19 November 2026)

Built on the `phase-2-swap-today-cleanup` branch (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10): the iPhone checks page removed, a swap part-way through an exercise, a swap to an alternate not yet in your library, and the Home screen's Today panel.

### O. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** The new app sends the account a new kind of change when a swap adds an exercise. If the app arrived first, that change would be refused, and the workout changes after it with it. Run before merging, nothing changes for the app you have now, except that the old **iPhone checks** page stops working, which is the point.

**What it deletes:** the iPhone checks page's two tables (its notification addresses, and its test rest alerts), its helper and its 5-second scheduled job. Your workouts, sets, library, account and the real rest alerts are not touched.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261119000200_swap_new_exercise_and_remove_test_page.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261119000200_swap_new_exercise_and_remove_test_page.sql). It should end with "Success. No rows returned". Safe to run more than once.
2. [x] To check: in a new query, paste `select count(*) from cron.job where jobname = 'lab-rest-alerts';` and click **Run**. It shows **0**.

**Done 19 November 2026:** Nate ran the file before the merge. Pull request 22 was then merged into `main` at his request, after GitHub's checks passed.

### P. On your iPhone, after the merge

Open Chalk and Iron from its home-screen icon. If it looks unchanged, swipe it away and open it again.

1. [x] **Home.** The **iPhone checks** button is gone. A **Today** panel shows today's date and "No workout planned for today", with **Start another workout** (planned days arrive with the planner). While a workout runs, it shows **Resume** and the workout's name instead.
2. [x] **Swap part-way.** Start a quick workout with `Barbell Bench Press`, tap **Start exercise** and log one set. Tap **Swap**. The sheet says the 1 set you logged stays with Barbell Bench Press and the 2 sets left are done as the exercise you pick. Tap **Dumbbell Bench Press**. The screen moves to Dumbbell Bench Press with 2 sets and **Start exercise**. Open the tray (**Workout** at the top): Barbell Bench Press shows **Done** with its one set, and Dumbbell Bench Press comes right after it.
3. [x] **Swap in a superset.** Start **Superset test**, tap **Start exercise** and log one full round (a set on each exercise). Tap **Swap** and pick an alternate. The superset carries on with the new exercise in its place for the rounds left, still alternating. Part-way through a round, the sheet says to finish the round first.
4. [ ] **Swap to an exercise not in your library.** Every alternate in the starter library is already in your library, so this one shows only once the planner can archive or rename exercises (Phase 3). The test browser on GitHub checks it meanwhile: the new exercise is added at once, "Added to your library" shows its suggested details with an equipment picker, and **Confirm details** saves them.
5. [x] **Swap to any exercise in your library** (after the next merge). Tap **Swap**, type part of a name under **Or any exercise in your library**, and tap one. The workout changes to it, with the same rules as an alternate.

**Nate's results, 19 November 2026:** steps 1, 2, 3 and 5 passed. Step 3: the bench press was replaced and the other exercise stayed in the superset. He then asked to swap to any exercise in the library, not only the three alternates; that was built as step 5 (pull request 25) and passed. Step 4 cannot be done on the phone until Phase 3; GitHub's browser test covers it.

## 7. Phase 2 review fixes (20 November 2026)

A fresh review of Phase 2 found seven problems, and Nate chose to fix all seven (`docs/TECHNICAL_DESIGN.md` Section 10E, point 10, "Phase 2 review"). They are on the `claude/serene-ritchie-ch1e1x` branch. **No SQL to run:** every fix is in the app itself.

### Q. On your iPhone, after the merge

Open Chalk and Iron from its home-screen icon. If it looks unchanged, swipe it away and open it again. Finish any test workout at the end.

1. [x] **Skip part-way.** Start a quick workout with two exercises. Tap **Start exercise** and log 2 sets on the first. Open the tray (**Workout** at the top) and tap **Skip** on that exercise. The top line still counts the 2 sets as done, the exercise shows **Skipped** with its 2 boxes filled, and **Stats** shows an efficiency, not "n/a".
2. [x] **Undo break.** Start **Superset test** and tap **Start exercise**. Wait about 30 seconds, tap **Break superset**, wait about 20 seconds, then tap **Undo break**. The exercise clock shows about 50 seconds used, not more, and keeps counting.
3. [x] **Move after a break.** In a workout with a superset and another exercise, tap **Break superset**, then open the tray. Tap **↑** on the first of the exercises the break made (or **↓** on the exercise just above it). It moves on the first tap.
4. [x] **Warm-up after a break.** After **Break superset**, note **Budget** under the exercise clock. Tap the words of the set 1 row, to the left of the vertical bar (not the **⋯**), to make it a warm-up. A **fourth** set appears (Superset test has 3 rounds), and the budget grows by one set's work and rest.
5. [x] **Delete after a superset swap.** Start **Superset test**, log one full round, and swap the first exercise. On the other exercise, tap **⋯** on set 1, then **Delete this set**. The message reads "Set 1 is removed", not "removed from all 2 exercises".

Two more fixes have no quick iPhone check, and GitHub's tests cover them: a workout that finished itself while paused now reopens running, not "paused"; and **+ Set** stops at 24 sets, the most the account keeps for one exercise.

**Result: all five passed on Nate's iPhone on 20 November 2026.** Check 4 failed the first time because Warm-up was chosen in the **⋯** sheet, which did not add a set the way the tap does. Nate decided the two must behave the same, which led to step R.

## 8. Phase 2: Warm-up in the set details sheet (20 November 2026)

Nate decided that choosing Warm-up in the set details sheet must do exactly what tapping the set does. It is on the `phase-2-warmup-sheet` branch. **No SQL to run:** the fix is in the app itself.

### R. On your iPhone, after the merge

Open Chalk and Iron from its home-screen icon. If it looks unchanged, swipe it away and open it again. Finish the test workout at the end.

1. [x] **Warm-up from the sheet.** Start **Superset test** and tap **Start exercise**. Note **Budget** under the exercise clock. On set 1, tap **⋯** and choose **Warm-up**, then save. A 4th set appears on both exercises, and the budget grows by one round of work and rest (from 7:30 to 10:30 with the usual numbers).
2. [x] **Back to Working.** Tap **⋯** on set 1 again and choose **Working**, then save. The 4th set goes away on both exercises, and the budget returns to what it was.

**Result: both passed on Nate's iPhone on 20 November 2026.**

## 9. Phase 3 opening: three carried workout fixes (20 November 2026)

The fresh check after the Phase 2 review found three older problems, which Nate chose to fix first in Phase 3 (`docs/TECHNICAL_DESIGN.md` Section 5, Session). They are on the `phase3-opening` branch. **No SQL to run:** every fix is in the app itself.

### S. On your iPhone, after the merge

Open Chalk and Iron from its home-screen icon. If it looks unchanged, swipe it away and open it again. Finish each test workout at the end.

1. [x] **Undo break comes back even.** Start **Superset test** and tap **Start exercise**. Note **Budget** under the exercise clock. Tap **Break superset**. Tap the words of the set 1 row, to the left of the vertical bar (not the **⋯**), to make it a warm-up: a 4th set appears. Tap **Undo break**. Both exercises show 3 sets again, with no warm-up, and **Budget** is what you noted.
2. [x] **A finished exercise opens again.** Start a quick workout with one exercise. Tap **Start exercise** and log every set, tapping **Skip** on each rest, until the exercise shows as done and its clock stops. Tap the words of the set 1 row to make it a warm-up. A set to do appears and the exercise clock counts again. Log it: the clock stops again.

The third fix (a record badge left on a warm-up while offline) needs a record set to show, so it has no quick iPhone check; GitHub's tests cover it.

**Result: both passed on Nate's iPhone on 20 November 2026.**

## 10. Phase 3: the planner's Library and Vocabulary (20 November 2026)

The first planner screens. They are on the `phase3-library-vocabulary` branch (pull request 35). **No SQL to run:** the screens use the tables that already exist. The planner is made for a computer browser.

### T. In your computer's browser, after the merge

**First try, 20 November 2026: the tables were unreadable** (Exercises showed a count but no list; Workouts, Campaigns and Vocabulary were squashed). Cause: the planner reused a style name the phone's workout tray already had, so every planner panel was drawn 14 pixels wide. Fixed in the layout pull request after 38; run step T again after it is merged.

Open https://chalkandiron.vercel.app and sign in (a passkey, as on the phone). On the home page tap **Planner** (next to **Account**), or go straight to https://chalkandiron.vercel.app/planner. You land in **Library**.

1. [x] **Exercises.** Under **Library**, **Exercises** shows your 227 exercises in a table. Type `dumbbell incline press` in the search box: **Incline Dumbbell Press** shows. Press **Add exercise**, type that same name, pick a muscle group and equipment: a warning says it looks like an existing exercise, and **Add to library** asks you to confirm. Press **Cancel**.
2. [x] **Rename keeps history.** Change the name of any exercise and press Enter. The new name shows at once. (Its logged sets stay with it; the tests check that.)
3. [x] **Archive and restore.** Press **Archive** on `Barbell Curl` and confirm. It disappears. Tick **Show archived**: it shows faded with an **Archived** tag and a **Restore** button. Press **Restore**.
4. [x] **Workouts.** Open **Workouts**, pick **Superset test**. Change **Sets** on one of the two superset exercises: the other changes with it. Press **Details** on a row: the **Exercise** panel on the right shows its swaps, graph and records. Press **Copy this one**, then **Archive** the copy.
5. [x] **Campaigns.** Open **Campaigns**. Press **New campaign**, name it `Test block`, pick a workout for two days, then press **Activate**. If another campaign is active, you are asked to confirm it ends. Press **Shift forward a week** and confirm; the dates move. Press **End campaign** on it.
6. [x] **Vocabulary.** Open **Vocabulary** (top row). Rename the equipment value `cable` to `cable stack`, then look at any cable exercise under **Exercises**: it shows `cable stack`. Rename it back. Press **Archive** on `band`: it says exercises keep it. Press **Restore**.
7. [x] **Pounds or kilograms.** Top right, press **Kilograms**, then press **Details** on `Barbell Bench Press` (if it has history): the records show kilograms to one decimal.
8. [x] **Carried: step P item 4 (swap to an exercise not in the library).** In **Exercises**, archive `Dumbbell Bench Press`. On your iPhone, start a quick workout with `Barbell Bench Press`, tap **Swap** and pick the **Basic gym** alternate: it is added to your library at once, and **Added to your library** shows suggested details with an equipment picker. Tap **Confirm details**. Back in the planner, the new `Dumbbell Bench Press` is live; archive or rename it and **Restore** the old one if you want your original back (two live exercises cannot share a name, so restore only after renaming or archiving the new one).

**Result: all eight passed in Nate's browser on 21 November 2026, after the layout fix.** His notes: it was not clear that a rename or a workout edit was being saved, button presses gave no sign they registered, and some boxes were not lined up vertically. The next pull request adds those (step W).

## 11. Phase 3: deciding a day sent from the planner (20 November 2026)

When a day is sent from the planner and today already has a workout, it arrives as a card with **Accept** and **Dismiss** (`docs/TECHNICAL_DESIGN.md` Section 2, "Deciding a sent day"). This adds the database step behind those two buttons. It is on its own branch, beside the planner screens.

### U. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** The planner's Accept and Dismiss buttons call it, so it must be there first. Run before merging, nothing changes for the app you have now.

**What it changes:** it adds the Accept and Dismiss step, stops a coach adding a card that claims to come from your planner, and updates the function phones send workout changes through, so a phone still holding a workout that was replaced cannot reopen it. It removes no table and deletes no data.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261120000100_decide_planner_proposal.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261120000100_decide_planner_proposal.sql) (this link now shows the file on `main`). It should end with "Success. No rows returned". Safe to run more than once.
2. [x] To check: in a new query, paste `select count(*) from pg_proc where proname = 'decide_planner_proposal';` and click **Run**. It shows **1**.

The iPhone checks for Accept and Dismiss come with the planner's inbox card, once both pull requests are merged.

**Done:** Nate ran the file before pull request 36 was merged (20 November 2026).

## 12. Phase 3: Plan, History and sending a day to the phone (20 November 2026)

The rest of the planner. **No SQL of its own**, but it needs step U (pull request 36) merged first, because Accept and Dismiss call that database step. Merge order: 36, then this one.

### V. In your computer's browser, then on your iPhone, after both merges

Open https://chalkandiron.vercel.app/planner. The top row now has **Plan**, **Library**, **History** and **Vocabulary**.

1. [x] **Plan.** Open **Plan**. Pick a campaign (make and activate one under **Library**, **Campaigns** if you have none), a week and a day with a workout. Change **Reps** on one row: the old value shows under it as `library: 10`. Open **Library**, **Workouts**: the workout itself is unchanged, and so are the other days.
2. [x] **Superset sets.** On a day with a superset, change **Sets** on one of its exercises: the other changes too.
3. [x] **Weight in kilograms.** Press **Kilograms** (top right), type `27.5` in a **Weight** box, press Enter. Press **Pounds**: it shows 60.6. Clear the box to go back to your last weight.
4. [x] **Clear overrides.** Press **Clear this day's overrides** and confirm: the library values are back.
5. [x] **Send with no workout today.** On a day when your campaign has nothing planned today (or with no active campaign), pick any day with a workout and press **Send to phone as today's workout**. On the iPhone, **Today** on the Home screen shows it at once, with **Start**.
6. [x] **Send when today has a workout.** Press **Send** again for a different day. The planner says it is waiting in the inbox. On the iPhone Home, under **Coach proposals**, a card says what would replace what, with **Accept** and **Dismiss**. Press **Dismiss**: nothing changes. Send again and press **Accept**: Today shows the new workout.
7. [x] **Accept mid-workout.** Start any workout on the phone and log one set. Send a day from the planner and press **Accept** on the phone. The phone says your workout was saved and replaced, and **Go to Home** shows the new day. **History** shows the first workout with a **Replaced** tag.
8. [x] **History.** Open **History**: sessions with time, volume, efficiency and records. Press **Open** on one, change a set's reps and press **Save**, then check the **Graph and records** panel: the records follow. Press **Delete** on a set and confirm.

**Result, 21 November 2026:** items 1 to 5, 7 and 8 passed in Nate's browser and on his iPhone. Item 6's setup was unclear (activating a campaign ends the one active, as it should); **Nate agreed** to count it passed, since item 7 uses the same card and GitHub's database tests cover Dismiss and Accept with no workout running. His notes: the inbox did not look like an inbox, and editing in History was buried under the list (step X).

## 13. The planner: presses, saving and alignment (21 November 2026)

From Nate's notes on step T. **No SQL to run.**

### W. In your computer's browser and on your iPhone, after the merge

Open https://chalkandiron.vercel.app/planner (reload with Cmd+Shift+R if it looks unchanged).

1. [x] **Saving is clear.** At the top, between **Planner** and **Weights in**, a line reads "Changes save as you make them". Under **Library**, **Workouts**, change **Reps** on a row and press Enter: the line says "Saving…", then "All changes saved" with the time, and a small tick shows beside the box for a moment. Rename an exercise under **Exercises**: the same.
2. [x] **Presses show.** Press and hold any button (in the planner, and on the phone's Home and workout screens): it dims and gets a coloured ring while held. Nothing moves.
3. [x] **Lined up.** In **Workouts**, each row's exercise, **Details**, sets, reps, rest, superset and the **↑ ↓ Remove** buttons sit on one line, with nothing cut off at the right. In **Campaigns**, the Name, Start date and Weeks boxes line up along their bottom edge.

**Result: all three passed and were clear, Nate, 23 November 2026.**

## 14. Inbox above Today, and easier History editing (21 November 2026)

From Nate's notes on step V. **No SQL to run.**

### X. On your iPhone and in your computer's browser, after the merge

1. [x] **Inbox.** In the planner's **Plan**, send a day when today already has a workout. On the iPhone Home, an **Inbox · 1 waiting** panel with an orange border sits at the top, above **Today**, with the card's **Accept** and **Dismiss**. Press **Dismiss**: the panel goes away and nothing else changes.
2. [x] **History list.** In the planner open **History**. It shows the 10 latest sessions, with **Show 10 more** below when there are more.
3. [x] **Open under the row.** Click anywhere on a session's row. Its exercises and sets open right under that row. Click the row again to close it.
4. [x] **Edit a set.** Each set reads like "Set 1 · 180 lb × 8 · Working" with an **Edit** button. Press **Edit**: that one set turns into boxes with **Save**, **Cancel** and **Delete set**. Change the reps, press **Save**; the set goes back to plain text with the new reps. Press **Edit** then **Cancel**: nothing changes.

**Result, 23 November 2026: all four passed.** Item 1 passed on a retry: the card appears only after pressing **Send to phone as today's workout** in **Plan** while today already has a workout (giving today a workout in **Campaigns** makes it today's plan directly). Nate noticed the phone's Home did not show the card until he left the screen and came back.

## 15. Running a campaign again (21 November 2026)

**Nate decided on 21 November:** a finished campaign can be run again, rather than copied. **No SQL to run.**

### Y. In your computer's browser, then on your iPhone, after the merge

1. [ ] Open https://chalkandiron.vercel.app/planner, then **Library**, **Campaigns**. Pick a finished campaign (end one with **End campaign** if you have none). Below the grid, **Run again from** shows today's date, with a **Run again** button.
2. [ ] Press **Run again** and confirm. The campaign shows **active**, with the same days, and no second copy appears in the campaign list. If another campaign was active, you were asked first and it now shows **finished**.
3. [ ] On the iPhone Home, the week strip shows this campaign. Days you did in its last run do **not** show Done.

**Not run on Nate's devices (agreed by Nate, 23 November 2026):** the agent checked it in a local browser with test data, and the automated tests cover the rest. Nate will report anything that looks off in normal use.

## 16. The phone's Home notices a new card by itself (23 November 2026)

From Nate's note on step X: the card showed only after leaving Home and coming back. **No SQL to run.**

### Z. On your iPhone and in your computer's browser, after the merge

1. [ ] Open Chalk and Iron on the iPhone and leave it on **Home**. In the planner's **Plan**, send a day while today already has a workout. Within about 30 seconds, without touching the phone, the **Inbox · 1 waiting** panel appears at the top.
2. [ ] Lock the phone, send another day from the planner, then unlock it: the new card is there as soon as Home shows.
3. [ ] Press **Accept**: **Today** shows the new day straight away.

**Not run on Nate's devices (agreed by Nate, 23 November 2026):** the agent checked item 1 in a local browser with test data. Items 2 and 3 depend on the iPhone; Nate will report anything that looks off in normal use.

## 17. Fixes from the Phase 3 review (23 November 2026)

The fresh review found nine points, and **Nate chose to fix all nine** (`docs/NEXT.md`). **No SQL to run.**

### AA. In your computer's browser, after the merge

1. [ ] **A new superset.** Open https://chalkandiron.vercel.app/planner, **Library**, **Workouts**, and press **New workout**. Add two exercises. On the first row, under **Superset**, choose **New superset with the next exercise**. Both rows now show the same letter and the same sets, and **All changes saved** shows at the top.
2. [ ] **History goes further back.** Open **History** and press **Show 10 more** until it disappears: your oldest session is in the list.


## 18. Fixes from the Phase 3 review at high effort (23 November 2026)

The review at high effort found two points to fix, and **Nate chose to fix both** (`docs/NEXT.md`): sets logged on a swapped exercise could be saved under the old exercise when a sent day was accepted while the phone still had unsaved changes; and the Workouts screen refused to add an exercise to a superset when a campaign day overrode its sets.

### AB. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** The new Workouts screen saves through a new database step, so it must be there first. Run before merging, nothing changes for the app you have now.

**What it changes:** the function phones send workout changes through (late changes to a replaced workout now land correctly), and a new step for saving a workout with its day overrides. It removes no table and deletes no data.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261123000100_late_changes_and_workout_save.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261123000100_late_changes_and_workout_save.sql) (this link shows the file on `main` once the pull request is merged). It should end with "Success. No rows returned". Safe to run more than once. **Run by Nate on 24 November 2026.**

### AD. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged**, after step AB. The fix check of this pull request found that the phone's late changes to a replaced workout could reset its exercise times; this keeps them. Run before merging, nothing changes for the app you have now.

**What it changes:** only the function phones send workout changes through. It removes no table and deletes no data.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261124000100_late_copy_clocks.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261124000100_late_copy_clocks.sql) (this link shows the file on `main` once the pull request is merged). It should end with "Success. No rows returned". Safe to run more than once. **Run by Nate on 24 November 2026.**

### AE. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged**, after step AD. The second fix check of this pull request found that when the phone kept going with no signal after the day was accepted on another device, the exercise it was on when the signal came back was saved with no time, so that workout's efficiency showed too high; this keeps that time. Run before merging, nothing changes for the app you have now.

**What it changes:** only the function phones send workout changes through. It removes no table and deletes no data.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261124000200_late_copy_offline_time.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261124000200_late_copy_offline_time.sql) (this link shows the file on `main` once the pull request is merged). It should end with "Success. No rows returned". Safe to run more than once. **Run by Nate on 24 November 2026.**

### AC. In your computer's browser, after the merge

1. [x] **A day override and a superset.** Open https://chalkandiron.vercel.app/planner, **Plan**, pick a day whose workout has an exercise that is not in a superset, and change that exercise's **Sets**. Then open **Library**, **Workouts**, that workout, and put that exercise into a superset (under **Superset**, pick a letter, or **New superset with the next exercise**). **All changes saved** shows at the top, with no red message. Back in **Plan**, on that day, every exercise of the superset shows the same sets.

The phone side (a swap made with no signal, then a sent day accepted) is covered by the database tests; it is not a device check.

**Passed (Nate, 24 November 2026).**

## 19. The app icon (25 November 2026)

The app now has its own icon: the chalk handprint and dumbbell. An iPhone keeps the icon it took when the app was added to the home screen, so the new one shows only after adding it again.

### AF. On your iPhone, after the merge

1. [x] Press and hold the Chalk and Iron icon on your home screen, tap **Remove App**, then **Delete from Home Screen**. Your passkey and data are unaffected.
2. [x] Open https://chalkandiron.vercel.app in Safari, tap the **Share** button (the square with an arrow pointing up), then **Add to Home Screen**, then **Add**. The preview in that sheet already shows the new icon.
3. [x] The home screen shows the handprint and dumbbell icon, named Chalk and Iron. Open it from there and you land in the app, signed in.
4. [x] Rest alerts: removing the icon also removes this phone's notification permission. Start a workout; when **Turn on rest alerts** shows, tap it, then **Allow**. Log a set and lock the phone: "Rest over" should arrive when the rest ends. Finish the test workout at the end. **Done by Nate on 25 November 2026.**

## 20. Phase 4, stage 4A: the coach's data and the lock (25 November 2026)

Stage 4A adds what the coach's tools will read and write: the coach intake on the coach profile, an optional decline reason on a coach's card, and the weekly check-in marks. It also locks the database so that a coach's pass can only read, add a pending card, record a check-in and note a call. And it adds the way the coach eval account ("Test Account") is reset to a fixed starting state for the coach evals (`docs/TECHNICAL_DESIGN.md` Section 9). Nothing changes on any screen yet.

### AG. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** Run before merging, nothing changes for the app you have now.

**What it changes:** the coach profile gains the intake answers; a card can hold a decline reason; a new list of weekly check-ins; the call log is written through one guarded step; every function the app's API offers is closed to signed-out people and opened to signed-in people one by one; the coach eval account can be marked and reset. It also fixes a fault from Phase 1: editing a coach profile always failed (nothing edited one until now). It removes no table and deletes no data.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261125000100_coach_data_and_lock.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261125000100_coach_data_and_lock.sql) (this link shows the file on `main` once the pull request is merged). It should end with "Success. No rows returned". Safe to run more than once. **Run by Nate on 25 November 2026.**

### AH. Supabase SQL Editor: mark the coach eval account

**Run this after AG**, once. It marks the account named "Test Account" as the coach eval account (Nate, 25 Nov), so the eval reset can use it and nothing else. **Each reset replaces everything in that account's library, history, plans, cards, gyms and coach profile** with the eval data. Its sign-in, its devices and its coach connections are kept.

**Where:** the same **SQL Editor**, **New query**. Paste this and click **Run**. It should end with "Success. No rows returned". If it says it expected exactly one account named Test Account, tell the agent what it found.

```sql
-- Mark the coach eval account: the one account named "Test Account" (Nate, 25 Nov 2026).
do $$
declare
  n integer;
begin
  select count(*) into n from public.profiles where display_name = 'Test Account';
  if n <> 1 then
    raise exception 'Expected exactly one account named Test Account, found %', n;
  end if;
  update public.profiles set is_eval_account = false where is_eval_account and display_name <> 'Test Account';
  update public.profiles set is_eval_account = true where display_name = 'Test Account';
end $$;
```

1. [x] Run by Nate on 25 November 2026.

### AI. GitHub: a key of its own for the eval reset

The reset runs on GitHub, so an agent can reset the eval account whenever a scenario needs it without ever seeing a key. It gets **its own secret key**, not the one Vercel holds (which is never pasted anywhere else, step B3), so it can be cancelled at any time without touching the live app. The key is kept in GitHub's secret store, never in the repository, and the database lets the reset touch only the eval account.

1. [x] **Make the key in Supabase.** Open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **Project Settings** (the gear at the bottom of the left-hand menu), then **API Keys**. Under **Secret keys**, click **New secret key** (it may read **Add new secret key**), name it `github-coach-evals`, create it, and click **Copy** beside it. It starts `sb_secret_`. On the same page, or under **Data API**, copy the **Project URL**: the bare address like `https://abcd1234.supabase.co`, with nothing after `.co`. **Done by Nate on 25 November 2026.**
2. [x] **Add both to GitHub.** Open https://github.com/trantelica/chalk-and-iron/settings/secrets/actions and click **New repository secret**: **Name** `SUPABASE_SECRET_KEY`, the new key as the **Secret**, then **Add secret**. Click **New repository secret** again: **Name** `SUPABASE_URL`, the Project URL as the **Secret**, then **Add secret**. **Done by Nate on 25 November 2026.**
3. [x] **Try a reset, after the merge.** Open https://github.com/trantelica/chalk-and-iron/actions/workflows/coach-eval-reset.yml, click **Run workflow** on the right, leave **standard** chosen, and click the green **Run workflow**. After a minute or two the run shows a green tick. Sign in to the app as Test Account: **Home** shows Push A today, and the planner's **History** shows eight weeks of workouts. **Done by Nate on 25 November 2026: the run showed a green tick.**

To cancel the key later: the same **API Keys** page, the three dots beside `github-coach-evals`, **Delete**.

## 21. Phase 4, stage 4B: the coach connector (25 November 2026)

Stage 4B puts the real coach connector at its permanent link, **https://chalkandiron.vercel.app/mcp**, with the coach sign-in the Phase 1 proof tested. It has the first three things a coach can read: your profile (with the coach intake), your gyms and your vocabulary. The rest of the coach's tools come in later stages. Nothing changes on any screen.

### AJ. Supabase: switch on the coach sign-in

**Before the check in AK**, before or after merging. Nothing uses it until a coach app connects.

1. [x] Open https://supabase.com/dashboard and click the project `chalk-and-iron`.
2. [x] In the left-hand menu click **Authentication**, then **OAuth Server** (it may sit under **Configuration**).
3. [x] Turn on **Enable the Supabase OAuth Server** (the switch at the top).
4. [x] Set **Authorization Path** to `/oauth/consent`.
5. [x] Turn on **Allow dynamic client registration**. ChatGPT and Claude register themselves this way.
6. [x] Click **Save**.
7. [x] Still under **Authentication**, open **URL Configuration** and check that **Site URL** is `https://chalkandiron.vercel.app` (step A3). Supabase sends you to that address plus `/oauth/consent` to allow a coach.

**Done by Nate on 25 November 2026.**

### AL. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** Run before merging, nothing changes for the app you have now.

**What it changes:** it adds one read-only step that tells a connected coach app its own name ("ChatGPT", "Claude"), so the call log and, later, each coach card can say which app it came from. Supabase's sign-in no longer lets a coach read your list of connected apps, which is how the connector first tried to learn the name. It reads nothing about anyone else and changes no data.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the query, and click **Run**.

1. [x] [`20261125000200_coach_app_name.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261125000200_coach_app_name.sql) It should end with "Success. No rows returned". Safe to run more than once. **Run by Nate on 25 November 2026.**

### AK. ChatGPT and Claude: connect the real link and ask "who am I?"

**After the merge**, and after AL. Use your own account. You already have the proof's connector in both apps; leave it until this works, then remove it (step 4 of each).

**ChatGPT, on the web**

1. [x] Open https://chatgpt.com and add a custom connector in the same place you added the Phase 0 and proof connectors (when the proof ran, OpenAI's docs called it **Plugins** > **Add custom MCP server**; OpenAI moves this menu now and then).
   - **Name:** `Chalk and Iron`
   - **URL:** `https://chalkandiron.vercel.app/mcp`
   - **Authentication:** **OAuth**. Leave client registration automatic and type no client ID.
2. [x] ChatGPT opens a Chalk and Iron page. Sign in with Face ID or Touch ID if asked. Check it reads "Allow ChatGPT to read your training data and send you proposals?", then press **Allow**. You come back to ChatGPT.
3. [x] In a new chat inside your coach project, ask: **"Use Chalk and Iron: who am I?"** Expect your name, your goals and today's date. Tell the agent what it said.
4. [x] Then remove the proof connector from the same place, so only the real one is left.

**Claude, on the web**

1. [x] Open https://claude.ai, go to **Customize** > **Connectors**, then **Add**, then **Add custom connector**.
   - Enter the name `Chalk and Iron` and the link `https://chalkandiron.vercel.app/mcp`.
   - **Authentication:** **Sign in now**.
   - **OAuth client:** **Register automatically**. Do not choose "Use Claude's published identity". If Claude marks an option **Detected**, keep it.
2. [x] Click **Add**, then **Connect**. Sign in with Face ID or Touch ID if asked, check the question names Claude, and press **Allow**.
3. [x] In a new chat (or your coach Project), ask: **"Use Chalk and Iron: who am I?"** Expect your name. Tell the agent what it said.
4. [x] Then remove the proof connector: **Customize** > **Connectors**, the proof's entry, **Remove**.

**Done by Nate on 25 November 2026:** ChatGPT and Claude both connected to the real link and answered "who am I?".

If either app shows an error instead, copy its exact words for the agent. The agent can also read the Vercel log: each call writes one `MCP` line with no content.

