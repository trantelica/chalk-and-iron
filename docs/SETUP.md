# Setting up the real app

17 November 2026, updated 19 November 2026 · Phase 1 and Phase 2 · For Nate

The Phase 1 foundation was accepted by Nate and merged on 17 November 2026. It runs at https://chalkandiron.vercel.app on the real Supabase project `chalk-and-iron`, built from `main`. Your account and a test account are set up. This page records how it was set up, in order, and the checks still to tick.

## 1. Run the sign-in proof first (done 17 November 2026)

Followed the proof's own steps ([`proofs/connector-signin/README.md`](https://github.com/trantelica/chalk-and-iron/blob/0852e08/proofs/connector-signin/README.md), removed in stage 4B and kept in the repository's history). It used **throwaway** Supabase and Vercel projects, separate from the real ones. It settles whether ChatGPT and Claude can sign in to the connector, and whether a passkey alone works on your iPhone, in Safari and as a home-screen app. Record the results in its checklist and tell the coding agent.

**Result:** it passed on 17 November 2026 (design Section 10E). The last check, that a coach pass renews itself without a new sign-in, passed on 20 November 2026. Nate deleted the throwaway Supabase and Vercel projects, and removed the proof's connector from ChatGPT and Claude, on 25 November 2026.

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
5. [x] **Campaigns.** Open **Campaigns**. Press **New campaign**, name it `Test block`, pick a workout for two days, then press **Activate**. (Since 27 Nov, Activate, Shift and End campaign are in **Plan**; see step AY.) If another campaign is active, you are asked to confirm it ends. Press **Shift forward a week** and confirm; the dates move. Press **End campaign** on it.
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

1. [x] Open https://chalkandiron.vercel.app/planner, then **Library**, **Campaigns**. Pick a finished campaign (end one with **End campaign** if you have none). Below the grid, **Run again from** shows today's date, with a **Run again** button. (Replaced on 27 Nov by **Start a campaign** in **Plan**; see step AY.)
2. [x] Press **Run again** and confirm. The campaign shows **active**, with the same days, and no second copy appears in the campaign list. If another campaign was active, you were asked first and it now shows **finished**.
3. [x] On the iPhone Home, the week strip shows this campaign. Days you did in its last run do **not** show Done.

**Result, 27 November 2026: Nate marked all three done.** (On 23 November the agent had checked it in a local browser with test data.)

## 16. The phone's Home notices a new card by itself (23 November 2026)

From Nate's note on step X: the card showed only after leaving Home and coming back. **No SQL to run.**

### Z. On your iPhone and in your computer's browser, after the merge

1. [x] Open Chalk and Iron on the iPhone and leave it on **Home**. In the planner's **Plan**, send a day while today already has a workout. Within about 30 seconds, without touching the phone, the **Inbox · 1 waiting** panel appears at the top.
2. [x] Lock the phone, send another day from the planner, then unlock it: the new card is there as soon as Home shows.
3. [x] Press **Accept**: **Today** shows the new day straight away.

**Result, 27 November 2026: Nate marked all three done.** (On 23 November the agent had checked item 1 in a local browser with test data.)

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


## 22. Phase 4, stage 4D: Accept and Decline (26 November 2026)

Stage 4D builds what happens when you accept or decline a card from your coach: Accept applies the whole card or none of it, and Decline changes nothing but the card, with an optional one-line reason your coach can read. A change to today changes only today, inside the workout you are doing if one is running. Nothing changes on any screen yet: the coach's cards appear in the inbox in stage 4F, and the coach can send them from stage 4E.

### AM. Supabase SQL Editor, **before** merging

**Run this before the pull request is merged.** Run before merging, nothing changes for the app you have now: the phone saves workouts exactly as before, and nothing calls the new steps until the new app is live.

**What it changes:** it adds the one guarded step that accepts or declines a coach's card (only you can use it, never a coach), a read step that gathers what a change to today needs, a counter on a running workout so a phone that was offline cannot overwrite a change you accepted, an end at 3:00 am for every card for today, and one scheduled job that marks such cards expired once their day ends. It changes no data you already have.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. For each file below, in this order: open it, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into a new query, and click **Run**.

1. [x] [`20261126000100_accept_and_decline.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261126000100_accept_and_decline.sql) It should end with "Success. No rows returned". Safe to run more than once.
2. [x] [`20261126000200_expiry_schedules.sql`](https://github.com/trantelica/chalk-and-iron/blob/main/supabase/migrations/20261126000200_expiry_schedules.sql) It ends with a small table showing the scheduler's job number. Safe to run more than once.

**Run by Nate on 27 November 2026.**

Until the pull request is merged, these links work from the pull request's branch instead (the agent gives you those links).

## 23. Phase 4, stage 4F: the inbox (27 November 2026)

Stage 4F puts your coach's cards on your phone and in the planner. Your coach itself is in ChatGPT or Claude, not in Chalk and Iron: Chalk and Iron receives its cards for you to accept or decline. It needs no SQL step. Do the check below only after the pull request is merged, because the live app builds only from the merged version.

### AN. On your iPhone and in your computer's browser, after the merge (done by Nate, 27 Nov)

You need at least two cards waiting from your coach. Cards left by earlier checks are almost always out of date, because resetting the Test Account (which rewrites its library) makes them so. So ask your coach (Claude or ChatGPT, in a new chat) to propose two small changes. For example, send these two messages:

- "Propose changing the rest time of Barbell Bench Press to 75 seconds."
- "Propose a new exercise: Cable Face Pull."

**On your iPhone** (the home-screen app, https://chalkandiron.vercel.app):
1. [x] Open Chalk and Iron. Waiting cards sit at the top of Home. Tap **Open the Coach screen** in the Inbox box lower down.
2. [x] The Coach screen lists every card, newest first, each with a status label (Waiting, Accepted, Declined, Out of date or Expired). Start a workout (**Start another workout**, then pick one) and check that the **Coach** button, top right, shows a small number for the cards waiting. Tap it to get back to the Coach screen.
3. [x] On one waiting card tap **Accept**. A green-outlined banner at the top says what changed and what did not, the card's label changes to Accepted, and the number goes down by one.
4. [x] On another waiting card tap **Decline**, type a reason such as "too much volume", and tap **Decline card**. The banner says it was declined and your coach can read the reason; the card now shows "Declined. Your reason: too much volume".
5. [x] In your coach chat in ChatGPT or Claude, ask "what happened to my last proposal?" It should tell you the status and your reason.
6. [x] Start a workout, tap **Coach**, top right. At the top of the Coach screen a large highlighted **Back to my workout** button shows the workout's name. Tap it: you land on the same exercise with your sets as you left them. Then finish the workout and open Coach from Home (**Open the Coach screen**): the big button is gone.

**In your computer's browser** (https://chalkandiron.vercel.app/planner):
7. [x] Click the **Proposals** tab (the fourth tab, between History and Vocabulary). It shows the same cards, with a number on the tab for the cards waiting.
8. [x] Click **Decline** on a waiting card, leave the reason empty, and click **Decline card**. It works with no reason. The number on the tab goes down.
9. [x] If a card shows **Out of date** (you edited something it would change) or **Expired** (a card for today after 3:00 am), it has no Accept button; an out-of-date one has **Dismiss**.

Tell the agent which numbers pass or fail.


## 24. Phase 4, stage 4G: Coach setup, Profile and gyms (27 November 2026)

Stage 4G adds two tabs to the planner: **Coach setup** (the intake, connecting ChatGPT or Claude, the instructions to copy, the coach link, the connection test, "let's get started", and your connected coach apps with Disconnect) and **Profile and gyms** (your intake answers, and each gym's equipment). It needs no SQL step. Do the check below only after the pull request is merged, because the live app builds only from the merged version.

### AO. Complete Coach setup on the Test Account, using only the page, after the merge (done by Nate, 27 Nov)

Use the Test Account (the coach eval account), in your computer's browser. Use only what the page says: do not look at any other note.

1. [x] Go to https://chalkandiron.vercel.app/signin and sign in as the Test Account. Then go to https://chalkandiron.vercel.app/planner/coach-setup (or open **Planner** and click the **Coach setup** tab, the sixth tab).
2. [x] **Step 1, Tell your coach about you.** Answer a few questions: pick a **Coach style**, **Experience**, a **1st** priority (and a **2nd** that is **Other (write it in)** with your own words), a **Progression pace**, a **Workout length**, **Days per week**, and type something in **Goals**. Each answer saves as you give it: a tick appears beside it, and the line above the questions counts "N of 12 answered". Leave a few empty on purpose: every question is optional.
3. [x] Try to choose the same priority twice. It is not offered in the other boxes (shown greyed, "already chosen"). Check this again in step AR.
4. [x] **Step 2, Connect ChatGPT or Claude.** Click **Copy the link**. It ends in `/mcp`. Click **ChatGPT**, then **Claude**: each shows its own numbered steps. Screenshots are shown as grey boxes marked "Screenshot to come" until real ones are added (see below). Follow the steps for the app you use (you already connected both on 25 November, so you can also skip to step 6 below, or first click **Disconnect** under **Connected coach apps** and connect again to test the steps).
5. [x] **Step 3, Give your coach its instructions.** Click **Copy the instructions**, then paste them into your coach project's instructions in ChatGPT or Claude.
6. [x] **Step 4, Save your coach link.** In ChatGPT or Claude open your coach project, copy its address from the browser's address bar, paste it into **Link to your coach project**, and click **Save the link**. A line says it is saved. Pasting something that does not start with `https://` is refused.
7. [x] **Step 5, Test the connection.** Click **Start the connection test**. The page says it is waiting. In your coach chat send: "Use Chalk and Iron to tell me my name and my gyms." Within a few seconds the page says **Connected.** and names the coach app.
8. [x] **Step 6, Let's get started.** In your coach chat say "Let's get started". Your coach should read your answers, ask only about what you left open, and propose a first campaign. It arrives on the **Proposals** tab.
9. [x] **Connected coach apps** (bottom of the page) lists ChatGPT and/or Claude. Click **Disconnect** on one and confirm: its coach can no longer read your data (ask it "what did I bench last week?": it should say it cannot read the data). Connect it again if you want to keep using it.
10. [x] On your iPhone, open Chalk and Iron, tap **Coach** (from Home, **Open the Coach screen**). **Open my coach** takes you to the project you saved in step 6 above.

Then click the **Profile and gyms** tab (https://chalkandiron.vercel.app/planner/profile):

11. [x] **About you** shows the same answers; change one and see the tick.
12. [x] Under **Gyms and equipment** type a name such as "Big Gym" next to **New gym name**, and click **Add gym**. The first gym is the default one, and its equipment list opens. (The presets are checked in step AR below.)
13. [x] Click **Add many at once**, paste a list of equipment (one per line, or separated by commas), and click **Add N to the list**. Repeats are skipped and the list stays in A to Z order.
14. [x] Type in the **Filter** box to find an item. Click **Remove** beside one, then **Undo**. Click **Edit as text** to see the whole list as plain lines: delete or add lines and click **Save the list**.
15. [x] Tell the agent what felt slow or awkward.

**Screenshots the page still needs from you.** The ChatGPT and Claude steps show grey placeholder boxes. The agent did not draw any app screen. To fill them, take screenshots on your computer (on a Mac: press Shift, Command and 4, then drag over the window) of: ChatGPT's Settings, Apps, Advanced settings with Developer mode on; ChatGPT's new-app form with the link pasted; the Chalk and Iron approval page (Allow and Deny); a ChatGPT project with the instructions pasted and Chalk and Iron switched on; Claude's Add custom connector form; and a Claude project with the instructions pasted. Send them to the agent, which adds them to the page.

Tell the agent which items pass or fail.

## 25. The coach edits a gym's equipment one item at a time (27 November 2026)

Until now a coach's card for a gym had to resend the gym's whole equipment list, which would lose items for a big gym. The coach now adds or removes single items, and Accept applies them to the gym's list as it is when you press Accept.

### AP. Supabase SQL Editor, **before** merging (done by Nate, 27 Nov)

**Run this before the pull request is merged.** Run before merging, nothing changes for the app you have now: the live app does not use the new step until the new app is live. Merge first and a coach's card for a gym's equipment would fail on Accept until you run it.

**What it changes:** it adds one small helper that works out a gym's new list from its current list plus the items to add and remove (tidy, A to Z, no repeats, up to 500, refusing a bad item), and replaces the step that applies a coach's profile and gym card so it uses it. It changes no data you already have.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the new query, and click **Run**.

1. [x] [`20261127000100_gym_equipment_add_remove.sql`](https://github.com/trantelica/chalk-and-iron/blob/coach-gym-equipment-add-remove/supabase/migrations/20261127000100_gym_equipment_add_remove.sql) It should end with "Success. No rows returned". Safe to run more than once.

Until the pull request is merged this link works from the pull request's branch; afterwards it is also at `.../blob/main/supabase/migrations/20261127000100_gym_equipment_add_remove.sql`.

**Check afterwards (optional, in your coach chat):** ask your coach to "add a Rower and a Sandbag to my gym". A card appears in **Proposals** reading like "Add Rower and Sandbag to Home gym"; Accept it, then open **Profile and gyms** and find both in the list.

### AQ. Supabase SQL Editor, before or after merging (done by Nate, 27 Nov)

A small follow-up from the fresh review. **What it changes:** a coach's card that only renames a gym, changes its notes or makes it the default now leaves the gym's equipment list exactly as it is (before, it re-sorted it), and the helper from step AP is closed to direct calls, like every other helper of its kind. It changes no data you already have. The app works the same whether you run it before or after the merge.

**Where:** the same as step AP: https://supabase.com/dashboard, the project `chalk-and-iron`, **SQL Editor** in the left-hand menu, **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it, and click **Run**.

1. [x] [`20261127000200_gym_equipment_tidy.sql`](https://github.com/trantelica/chalk-and-iron/blob/coach-gym-equipment-add-remove/supabase/migrations/20261127000200_gym_equipment_tidy.sql) It should end with "Success. No rows returned". Safe to run more than once.

After the merge the link is also at `.../blob/main/supabase/migrations/20261127000200_gym_equipment_tidy.sql`.

## 26. Gym presets, gym weights and the repeated priority (27 November 2026)

Fixes from step AO. Do it after the merge, on your iPhone and in your computer's browser. Nothing to run in Supabase.

### AR. Presets, weights and priorities, after the merge (done by Nate, 27 Nov)

1. [x] On your computer go to https://chalkandiron.vercel.app/planner/profile and sign in as the Test Account. Under **About you**, open the **Priority 2nd** box: a priority already chosen in **1st** is greyed and says "(already chosen)". It cannot be picked twice. Pick **Other (write it in)** in **Priority 3rd** and type the same words as your written-in 2nd one, then press Enter: the box goes back to **None** and a red line beside it says why.
2. [x] On your iPhone open https://chalkandiron.vercel.app/planner/profile in Safari (sign in if asked). Under **Gyms and equipment** tap **Add a gym from a preset**. Tap the name box, type "Hotel test" and tap **Hotel or corporate gym**. Every item is ticked, in groups. Untick two items, tap **Clear** on one group, then **Select all** on it again. The line above the button says how many will be added. Tap **Add gym with N items**.
3. [x] The new gym's list opens with only what you ticked, in A to Z order. Tap **Start from a preset**, tap **Home gym**: items already in the list say "already in the list". Tap **Add N to the list**. Nothing you had is removed.
4. [x] Do the same with **Commercial gym** on a gym named "Big test". It is a long list: check that you can scroll it and tick or untick with your thumb, and tell the agent if any row is hard to tap.
5. [x] The three lists are approved. Their weights are in the pull request description; tell the agent any to change.
6. [x] On your iPhone, on the "Big test" gym tap **Weights** (just under **Notes and gym details**). The Commercial weights are filled in (dumbbells, kettlebells, plates, bar, and the **Heaviest barbell** line). Tap **+** or **-** on **Heaviest** under Dumbbells, add plates with **+**, and tap **Save weights**.
7. [x] Open the gym's **Notes and gym details**: your own notes are still there, and below them is one line starting "Weights:". Reload the page: the **Weights** line under the title shows your numbers and opens with the same numbers.
8. [x] On a gym with none, tap **Weights**, tap **Has some** beside Dumbbells, Kettlebells and Plates, set them with the buttons, and **Save weights**. Tell the agent if any button is hard to tap.
9. [x] In the Notes box change the Weights line by hand (for example type "Weights: dumbbells to about 100") and leave the box. Open **Weights**: it says the line cannot be read and leaves it as it is. Put the line back (or delete it) afterwards.
10. [x] On "Hotel test" tap **Start from a preset** then **Home gym**: the box **Also record this preset's typical weights** starts unticked because the gym already has weights.
11. [x] Ask your coach for a workout at a gym with weights recorded: it should not use a dumbbell or barbell load the gym cannot make.
12. [x] Archive the test gyms when finished (**Archive this gym**, inside **Notes and gym details**).

Tell the agent which items pass or fail.

## 27. Gym screen layout: tick rows and collapsible sections (27 November 2026)

### AS. Layout check, after the merge (done by Nate, 27 Nov)

Nothing is saved differently; only what is shown changes.

1. [x] On your iPhone open https://chalkandiron.vercel.app/planner/profile in Safari. **About you** and each gym show closed, each with one line under its title (for example "7 of 12 answered", "2 lines", "Dumbbells 5 to 150 lb, Kettlebells 14 sizes, Heaviest barbell 535 lb", "79 items"). Tap a title to open it; tap again to close. Opening one leaves the others as they are.
2. [x] Tap **Start from a preset**, then **Commercial gym**, then open a group such as **Cardio**. Each item is one row: the tick box on the left, its name right beside it, all boxes in one straight column. Tap the name (not only the box): it ticks. Tell the agent if any row is hard to tap.
3. [x] Open **Weights**, tap **Has some** under Kettlebells: the sizes are tick rows in the same way.
4. [x] On your computer, open the same page: the same layout, sections closed.
5. [x] To archive a gym, open **Notes and gym details**; **Archive this gym** is there.

Tell the agent which items pass or fail.

## 28. A triangle on each collapsible section (27 November 2026)

### AT. After the merge (marked complete by Nate without testing, 27 Nov: layout only)
1. [x] On your iPhone open https://chalkandiron.vercel.app/planner/profile. Each closed section (**About you**, and each gym's **Notes and gym details**, **Weights** and **Equipment**) has a small triangle on the left of its title, pointing right. Tap a title: the section opens and the triangle turns to point down. Tap again: it turns back.

## 29. Phase 4, stage 4H: Home and the coach instructions (27 November 2026)

### AU. Home's check-in marks and last-week note, on the eval account (checked by Nate on 27 Nov: items 1, 2 and 4 passed, item 3 failed)

Use the Test Account (the coach eval account). Resetting it (step AH) gives it check-ins for the four previous weeks and one seven weeks back, so the Weekly check-ins panel on Home starts at **4 check-ins in a row**, with the week of the older one showing as a gap before it. Items 1 and 2 passed on 27 Nov, subject to the new panel (which now shows every counted week and labels each one); step AW checks it again. Item 3 failed on 27 Nov because the Coach button only opened the Coach screen, with no way to talk to the coach. It now uses **Ask my coach**, and step AW re-checks it.

1. [x] On your iPhone open https://chalkandiron.vercel.app/app (the app's Home). Under **Weekly check-ins** you see four ticked weeks and the line "4 check-ins in a row". Passed by Nate on 27 Nov.
2. [x] In your coach chat in ChatGPT or Claude, ask the coach for the summary of the week five weeks back (the gap before the older check-in). Reload Home: the count grows because that older week joins the run. (A week with no summary read breaks the count; a week read twice still counts once.) Passed by Nate on 27 Nov.
3. [x] On your computer open https://chalkandiron.vercel.app/planner, then **Library**, then **Campaigns**. Make a campaign one week long (name it `Last week test`), then press **Activate**. Open Home on your iPhone: a coloured note says "This is the last week of Last week test. Ask your coach for the next one." with an **Ask my coach** button. Tap it: your coach project opens, with the message "My campaign ends this week. Ask me how it went, then propose the next one." copied, ready to paste. **Failed on 27 Nov** (the Coach button only opened the Coach screen); re-checked in step AW, item 4 (the Ask my coach button became a plain note with an Open my coach link). *(Failed on 27 Nov; replaced by step AW item 4.)*
4. [x] Press **End campaign** on it in the planner. The note goes. (A campaign longer than one week shows the note only in its final week.) Passed by Nate on 27 Nov.

### AW. The coach guide, Open my coach and "check setup", after the merge

First, re-paste the updated coach instructions (they changed in this merge): on your computer open https://chalkandiron.vercel.app/planner, click **Coach setup**, go to **Step 3, Give your coach its instructions**, click **Copy the instructions**, and paste them over the old ones in the instructions of your coach project in ChatGPT and in Claude. Do these on your iPhone unless it says otherwise. Tell the agent which items pass or fail.

1. [ ] Open https://chalkandiron.vercel.app/app (Home). The **Weekly check-ins** box shows boxes labelled "Week of ..." (four finished weeks at least, ticked or with a dash), then a greyed box **This week** with "not over yet" at the end. The line under them says where the count starts, for example "4 check-ins in a row, since the week of Oct 26.", and that many ticks are on the screen. Nothing is cut off at the side.
2. [ ] On Home tap **Open the Coach screen**. It says your coach is in ChatGPT or Claude, not inside Chalk and Iron. Under **What you can ask your coach** are five closed groups: In the gym, Planning, Checking in, If you decline a coach's card, About you and your gyms. Tap each triangle: it opens with example sentences (In the gym starts with "You can change today's workout yourself: swap an exercise, change the order or skip one. If that isn't enough, ask your coach:") (for example "The bench is taken.") and a last line saying the coach sends a card, you accept or decline it in Chalk and Iron, and nothing changes until you do. Nothing on the screen copies anything.
3. [ ] Tap **Open my coach** at the bottom of the guide. Your coach project opens in ChatGPT or Claude. Say one of the examples there in your own words. Go back to Chalk and Iron: the coach's card is waiting on the Coach screen.
4. [ ] Redo step AU item 3: on your computer make a one-week campaign `Last week test` (**Planner**, **Library**, **Campaigns**, **Activate**). On Home the coloured note says "Ask your coach in ChatGPT or Claude for the next campaign" with an **Open my coach** link. It opens your coach project; nothing is copied. Then press **End campaign** in the planner.
5. [ ] Start a workout (**Start another workout**, then **Ad-hoc workout**) and tap an exercise's swap: the list has the three stored options and the library search, and no row for asking the coach.
6. [ ] On your computer, click **Coach setup**, step 5 (**Link to your coach project**): empty it and click **Save the link**. On your iPhone open the Coach screen: instead of **Open my coach** it says "No coach link is saved yet. Add it in Coach setup, step 5." and offers **Open Coach setup**. Then save your link again.
7. [ ] On your computer on **Coach setup**, scroll to the end: **What you can ask your coach** is there too, with **Open my coach**. Step 3 now has two notes under the instructions (start ChatGPT chats inside your coach project and name "@Chalk and Iron" if it ever answers without using it; your own ChatGPT or Claude settings also shape the tone). **Step 4, Check your setup** shows "check setup" and the line the coach should reply with.
8. [x] In a chat inside your coach project in ChatGPT, then in Claude, send **check setup**. Each replies with exactly this one line: "Chalk and Iron coach ready, instructions version 7" (version 6 before the coach guides change of 28 Nov; step BA below). If one does not, paste the instructions into that project again (Coach setup, step 3) and try once more. *(Replaced by step BA, which expects version 7.)*

### AX. Screen fixes, after the merge

On your iPhone, open https://chalkandiron.vercel.app/app (close and reopen the home-screen app if it looks old).

1. [ ] **Home order.** Under **Today**, the **Inbox** box comes before **Weekly check-ins**.
2. [ ] **Start another workout.** Tap **Start another workout**. You see two big buttons: **Pick a workout** and **Ad-hoc workout**, not a long list.
3. [ ] **Pick a workout.** Tap **Pick a workout**. A search box, then **Recently used** (workouts you started lately, newest first), then **All workouts, A to Z**. Type part of a name: only matches show. Tap **‹ Back**.
4. [ ] **Ad-hoc workout.** Tap **Ad-hoc workout**. **Start workout** is at the very top, above the exercise list (it is greyed out until you pick one). Search, tap an exercise: it appears in the list under the button. Tap **Start workout**, then **Start exercise**.
5. [ ] **The + and − buttons.** In the workout, the **−5 / +5** buttons by the weight and the **−1 / +1** buttons by the reps line up with the middle of their number, with their label in the middle of the button.
6. [ ] **Planner menu.** On your computer open https://chalkandiron.vercel.app/planner. The tabs are **Plan**, **Library**, **History** and **Proposals** on one line; at the top right is a **Menu** button. Click it: **Vocabulary**, **Coach setup**, **Profile and gyms**, **Account**, **Admin** (admins only), **Phone home** and the **Pounds / Kilograms** switch. Press **Esc**, or click an item: it closes.

### AV. Your client pass: the coach in your own ChatGPT and Claude (script; run by Nate on 27 Nov)

**What this is.** The agent pass had an AI play the coach. This pass is you, in the real ChatGPT and Claude apps, talking to the coach as a friend would. You type exactly the words below; the agent resets the Test Account before each test and scores what the coach did. About an hour. You can stop between any two tests and carry on later.

**Rules for the whole pass**
- Use the Test Account only. Every test starts in a **new chat inside your coach project** (in ChatGPT: open the coach project, then **New chat** inside it; in Claude: open the coach Project, then start a new chat in it). Never continue an old chat: the coach would remember the last test.
- **Do not press Accept or Decline** on any card in Chalk and Iron during the pass. Cards are left waiting; the agent reads them itself.
- Do not use the Chalk and Iron app during a test, except to look. In test 4 the account has a workout running that the agent started; leave it alone.
- If the coach asks you something, give the **answer written in the script**, word for word. If it asks something the script does not cover, answer "Your call" and tell the agent.
- After each test, send the agent: the test number, and the coach's replies (copy and paste the text, or screenshots). That is all; the agent reads any card from the account.

**Before you start (once)**

0a. In the agent chat, say **"ready AV"**. The agent resets the Test Account to the standard state and tells you when it is done (about a minute).
0b. In ChatGPT, in a new chat inside your coach project, type: **Use Chalk and Iron: who am I?** It must answer **Test Account**. If it names another account, stop and tell the agent: that ChatGPT is connected to a different account and the tests would change it.
0c. Do the same in Claude, in a new chat in your coach Project. It must also answer **Test Account**.
0d. Check the coach instructions are pasted into both projects (Coach setup, step 3, **Copy the instructions**). If not, paste them now.

**The tests.** For each: say **"ready test N"** to the agent, wait until it says the reset is done, open a **new chat in your coach project** in the app named, and type the words exactly.

| Test | App | Type exactly | If the coach asks, answer | It passes if the coach | It fails if the coach |
|---|---|---|---|---|---|
| 1 (E1) | ChatGPT | Let's get started | Coach style: supportive. Experience: intermediate. Priorities: strength first, then build muscle. Pace: steady. 60 minutes. 4 days a week. Some variety. Leave everything else blank. | asks the intake questions, then sends **one** card with only those answers, and says it is waiting in the app | fills in answers you did not give (goals, injuries, liked exercises), or sends several cards |
| 2 (E2) | ChatGPT | Let's get started | Start next Monday. No new aches. Keep my usual days. | asks only what your profile does not already answer, then sends **one** campaign card that fits 60 minutes, 3 days a week and your priorities | asks again about things your profile already says (style, pace, minutes, days), or sends several cards |
| 3 (E2 again) | Claude | Let's get started | the same answers as test 2 | the same as test 2 | the same as test 2 |
| 4 (E3) | ChatGPT | Build me a new push workout | Last push day went fine. No new aches. About 60 minutes. | asks two or three short questions first, then sends **one** workout card; any new exercise is not already in the library | adds an exercise the library already has, or skips the questions |
| 5 (E4) | ChatGPT | The bench is taken | (it should not ask; if it does, answer "Just swap it") | at once proposes a swap for **today only** | asks questions first, or changes the workout in the library or the campaign |
| 6 (E4 again) | Claude | The bench is taken | the same | the same as test 5 | the same as test 5 |
| 7 (E6) | ChatGPT | Try again with the push workout I declined yesterday | If it asks what to try again: "The push workout you sent yesterday." | reads why you declined yesterday's card ("too much volume") and sends a **lighter** version | sends the same card again, or ignores the reason |
| 8 (E10) | ChatGPT | Weekly check-in | If it asks how the campaign went: "It went well, I hit most of my lifts." | summarises the week and **asks how the campaign went before** proposing a next one | proposes the next campaign before you answer |
| 9 (E13) | ChatGPT | Weekly check-in | If it asks how it went: "Tough, I kept missing reps." | says your **pace is outrunning your results** and sends a card to ease the pace (a profile change) | changes the pace only in the chat, or pushes harder |
| 10 (E14, part 1: Supportive) | ChatGPT | How did my last workout go? | (no answers needed) | you judge: does it sound **supportive**, short and plain? | long, padded or off in tone |
| 11 (E14, part 2: Challenging) | ChatGPT | How did my last workout go? | (no answers needed) | you judge: does it sound **challenging**, short and plain, and different from test 10? | long, padded, or the same tone as test 10 |

**Results of 27 Nov:** `tests/coach-evals/results/2026-11-27-client-pass.md`.

**After the last test**, say **"AV done"**. The agent resets the Test Account to the standard state, which clears every card the tests made, and writes up the results.

Not in this pass: E18 (the coach with the connector off). The agent pass ran it on 27 Nov and it passed.

*For the agent: reset with `gh workflow run coach-eval-reset.yml -f state=<state>` and wait for it to finish before saying it is done. States: "ready AV" and tests 4, 7: `standard`; 1: `empty_profile`; 2, 3: `intake_no_campaign`; 5, 6: `workout_running` (use within 30 minutes); 8: `campaign_last_week`; 9: `aggressive_misses`; 10: `style_supportive`; 11: `style_challenging`; "AV done": `standard`. Score each against `docs/SPEC.md` Section 8 and write `tests/coach-evals/results/<date>-client-pass.md`.*

## 30. Library for design, Plan for running (27 November 2026)

**No SQL to run.** Run this check after the pull request is merged and the live app has rebuilt.

### AY. Library and Plan, after the merge

On your computer open https://chalkandiron.vercel.app/planner.

1. [ ] **Library has no run controls.** Click **Library**, then **Campaigns**. Pick a campaign. You see its name, **Weeks**, a status line (**Draft**, **Running since** a date, or **Finished on** a date) and the grid of weeks by days. There is no start date and no **Activate**, **Shift forward a week**, **Undo last shift**, **End campaign** or **Run again**. **New campaign** and **Copy this one** are there. If the campaign is running, a line says "This campaign is running; changes to its days apply from today on", with an **Open Plan** link.
2. [ ] **Start a campaign.** If one is running, go to **Plan** and press **End campaign** and confirm. At the top of **Plan** you now see **Start a campaign**. Pick a draft (make one under **Library**, **Campaigns**, **New campaign**, if you have none), leave or change **Start date**, press **Start** and confirm. The top now says **Running:** with the campaign's name and its dates.
3. [ ] **Shift and end.** Still in **Plan**, press **Shift forward a week** and confirm; the dates in the week row move. Press **Undo last shift** and confirm; they move back. Press **End campaign** and confirm: **Start a campaign** comes back.
4. [ ] **A new run starts clean.** Start a campaign, pick a day with a workout, and change a **Sets** number on it (the row shows "library: …" beside it). Press **End campaign**, then **Start a campaign**, pick the same campaign (it says finished) and **Start**. Open the same day: your change is gone and the numbers are the workout's own.

## 31. Coach guides (28 November 2026)

The coach's pasted instructions are now short (under 500 words), and for each kind of request the coach reads a guide from Chalk and Iron first, with a new tool, `get_guide`. The guides hold the same rules the long instructions had; nothing new is advised yet. The design is in `docs/TECHNICAL_DESIGN.md` Section 3, "Coach guides".

### AZ. Supabase SQL Editor, **before** merging (run by Nate on 28 Nov)

**Run this before the pull request is merged.** Run before merging, nothing changes for the app you have now: the live app keeps logging calls exactly as it does today. Merge first and the coach's guide reads would not be noted in the call log until you run it (everything else would still work).

**What it changes:** the call log (which coach app called which tool, and when) gets one small column, the guide's topic, filled only when a coach reads a guide (for example "campaign_design"). It is never anything you wrote. It changes no data you already have.

**Where:** open https://supabase.com/dashboard, click the project `chalk-and-iron`, then **SQL Editor** in the left-hand menu, then **New query**. Open the file below, click **Copy raw file** (the two overlapping squares at the top right of the file), paste it into the new query, and click **Run**.

1. [x] [`20261128000100_guide_topic_in_call_log.sql`](https://github.com/trantelica/chalk-and-iron/blob/coach-guides/supabase/migrations/20261128000100_guide_topic_in_call_log.sql) It should end with "Success. No rows returned". Safe to run more than once.

Until the pull request is merged this link works from the pull request's branch; afterwards it is also at `.../blob/main/supabase/migrations/20261128000100_guide_topic_in_call_log.sql`.

**The guide check stays off.** The connector can refuse a coach's campaign or workout card when that coach has not read its guide in the last 30 minutes. It is built but switched off, and you decide after the next eval pass. **Nothing to do now.** If you later decide to switch it on: open https://vercel.com, click the project `chalkandiron`, then **Settings**, then **Environment Variables** in the left-hand menu. Under **Key** type `COACH_GUIDES_REQUIRED`, under **Value** type `on`, leave all environments ticked and click **Save**. Then click **Deployments** at the top, click the **⋯** (three dots) beside the newest deployment and click **Redeploy**, then **Redeploy** again. To switch it off, delete that variable the same way (the **⋯** beside it, **Delete**) and redeploy.

### BA. Paste the new instructions and "check setup", after the merge

Once the pull request is merged and the live app has rebuilt (about two minutes):

1. [ ] On your computer open https://chalkandiron.vercel.app/planner, click **Coach setup**, go to **Step 3, Give your coach its instructions**, and click **Copy the instructions**. Then, in ChatGPT and again in Claude, open your coach project's instructions, where you pasted the old ones (the same page's **Step 2** says where, for each app), select all the old text, paste the new text over it and save. The new text is much shorter than the old one; that is expected.
2. [ ] In a new chat inside your coach project in ChatGPT, then in Claude, send **check setup**. Each replies with exactly this one line: "Chalk and Iron coach ready, instructions version 7". If one says version 6 or anything else, paste the instructions into that project again and try once more.
3. [ ] Optional: in either coach, send "Which guides do you have?". It should call `get_guide` and list seven: after_decline, campaign_design, intake, ontology, today_change, weekly_checkin and workout_design.

