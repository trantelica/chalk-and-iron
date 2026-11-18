# Setting up the real app

17 November 2026 · Phase 1, and the start of Phase 2 · For Nathan

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

### H. On your iPhone

1. The app now tells the iPhone it is a full home-screen app, which notifications need. Delete the Chalk and Iron icon from your home screen, open https://chalkandiron.vercel.app in Safari, Share > Add to Home Screen, and open it from there. Your passkey and data are unaffected.
2. Check the safe area: the heading no longer sits behind the camera cut-out or runs into the clock, and nothing sits on the home bar.
3. Tap **iPhone checks** on the home screen and work down the page. Tell the coding agent what happened at each step:
   - [ ] **Notifications.** Allow, then "Send one now". A notification appears.
   - [ ] **Rest alert, phone locked.** Start a 30-second rest and lock the phone. "Rest over" arrives when the rest ends. Note how late it says it was.
   - [ ] **Rest alert, another app open.** The same, with another app on screen instead.
   - [ ] **Screen stays awake.** With Keep awake on, the screen stays on past the Auto-Lock time.
   - [ ] Extra: **the rest sound with music.** The beep plays over music from another app, and the music keeps going.
4. **Reset retest.** With your test account signed in on two devices (the iPhone and a computer), make a reset link for it on the admin page. Both are signed out at once. Open the link on the iPhone and make the new passkey. The computer stays signed out, even after reloading.

