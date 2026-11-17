# Setting up the real app

17 November 2026 · Phase 1 · For Nathan

The Phase 1 foundation is built and tested on a local test database, but it does not run anywhere yet. Two things are waiting on your hands, in this order.

## 1. Run the sign-in proof first (done 17 November 2026)

Follow `proofs/connector-signin/README.md`. It uses **throwaway** Supabase and Vercel projects, separate from the real ones. It settles whether ChatGPT and Claude can sign in to the connector, and whether a passkey alone works on your iPhone, in Safari and as a home-screen app. Record the results in its checklist and tell the coding agent.

**Result:** it passed on 17 November 2026 (design Section 10E). The only check left is that a coach pass renews itself the next day. Once that is recorded, delete the throwaway Supabase and Vercel projects. Deleting them also frees the Supabase free-plan slot for the real project.

## 2. Then set up the real app

The proof has passed, and the permanent address is chosen (below). The Vercel project `chalkandiron` was created on 17 November 2026 with Vercel Authentication off.

### The permanent address (decided 17 November 2026)

The app's permanent address is **https://chalkandiron-trantelica.vercel.app**, chosen by Nathan on 17 November 2026. A passkey is tied to one web address. If the address changes later, every passkey made before the change stops working, and every coach connection has to be redone. So this address stays.

(`chalk-and-iron.vercel.app` and `chalkandiron.vercel.app` were both already taken by other Vercel accounts.)

### A. Supabase (about 15 minutes)

1. Create a new Supabase project on the free plan, named `chalk-and-iron`.
2. **Settings > JWT Keys.** Make sure the key is the newer ECC (P-256) kind, as in the proof (step A2 there).
3. **Authentication > URL Configuration.** Set the Site URL to `https://chalkandiron-trantelica.vercel.app`.
4. **Authentication > Passkeys** (or Sign In / Providers). Turn passkeys on. Relying Party Display Name: `Chalk and Iron`. Relying Party ID: `chalkandiron-trantelica.vercel.app`. Relying Party Origins: `https://chalkandiron-trantelica.vercel.app`.
5. **Authentication > Sign In / Providers > Email.** Turn off "Allow new users to sign up". Accounts are made only from invite links, by the app's server.
6. **SQL Editor.** Paste and run each file in `supabase/migrations/`, in name order: `…0100_foundation.sql`, `…0200_accounts.sql`, `…0300_schedules.sql`, `…0400_reset_cuts_off_at_once.sql`, then `…0500_reset_only_through_server.sql`. If the third says the scheduler extension is missing, turn on **pg_cron** under Database > Extensions and run it again.
7. **Settings > API Keys.** Keep the project URL, the publishable key and the secret key ready for step B3. The project URL is the bare address, like `https://abcd1234.supabase.co`, with no `/rest/v1` on the end. The secret key starts `sb_secret_`. A public key in its place gives the error "This endpoint requires a valid Bearer token".

The OAuth server for the coach connection is switched on in Phase 4, when the real connector is built.

### B. Vercel (about 10 minutes)

1. Done: the project `chalkandiron` exists, linked to the repository, framework Next.js, Vercel Authentication off. Until Phase 1 is merged, it is built from the `phase-1-foundation` branch.
2. Done: its address is the permanent one above.
3. **Settings > Environment Variables**, names only here, values from Supabase:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`, which is never pasted anywhere else
4. Deploy.

### C. Your admin account

1. The first admin invite is made once with `scripts/bootstrap-admin.mjs`. This needs a terminal with the secret key, so it is easiest to ask the coding agent to run it with you. It prints a link that works once.
2. Open the link on your iPhone in Safari, type your name and email, and create your passkey.
3. Add the app to your home screen, open it from there, and sign in with Face ID.

### D. Checks on your iPhone

Tick each one and tell the coding agent:

- [ ] The invite link registers you, and the passkey is created.
- [ ] Signing out and back in with Face ID works in Safari.
- [ ] The same works in the home-screen app.
- [ ] The admin page lists your account and makes an invite with ready-to-paste text.
- [ ] A second test account (a second email of yours) registers from that invite and sees its own 42 exercises, and the admin page shows it.
- [ ] Deactivating the test account stops it signing in. Reactivating lets it back in.
- [ ] Making a reset link for the test account signs it out at once, and its old passkey stops working, before the link is opened.
- [ ] Opening the reset link makes a new passkey and shows the reset notice.
