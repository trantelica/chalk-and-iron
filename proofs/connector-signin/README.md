# Sign-in proof (Phase 1 hard spot)

A small throwaway test, written 17 November 2026. It answers two questions before the real data model gets built on top of them:

1. **Can ChatGPT and Claude sign in to the connector?** The real connector needs sign-in. Phase 0 had none. MCP, the connector standard, requires a sign-in method called OAuth 2.1.
2. **Can a passkey (Face ID or Touch ID) be the only way to sign in?** If it can, the app never has to send email (Decisions, row H).

It has one read tool, `get_profile`. That tool reports who is signed in and whether the connection uses a **coach pass**, meaning a pass issued to ChatGPT or Claude, or an ordinary app sign-in. It holds no training data. Delete this folder, the Supabase project and the Vercel project once the results are recorded.

## What the research found

The details and sources are in "Sources" at the end.

- **Supabase can issue the coach passes.** Supabase's sign-in service can now act as the OAuth 2.1 server for MCP. The feature is in beta and free on all plans. Supabase handles the sign-in steps. We host one page, the approval page ("Allow ChatGPT to…?").
- **ChatGPT and Claude register themselves.** They do it through a step called dynamic client registration, and we register nothing by hand. Supabase does not offer the newer route, client ID metadata documents. Supabase's own code shows this. So when you add the connector in Claude, choose **Register automatically**.
- **A coach pass can be told apart from an app sign-in.** Every coach pass carries a `client_id` (which app it was issued to). An app sign-in has none. Supabase documents using this in the database's row-level security. So the database itself can refuse coach writes.
- **Supabase now has passkeys built in.** They have been in beta since May 2026. There is one catch. A passkey can only be added to an account that already exists, is marked confirmed, and is signed in. So the invite step needs a small server piece. It creates the account, then signs the person in once with a one-time token that is never emailed, then has them create the passkey. This proof does exactly that (`api/bootstrap.js`). No extra library such as SimpleWebAuthn is needed unless Supabase's beta passkeys fail.
- **A passkey belongs to one web address.** If the app's permanent address changes later, every passkey made before the change stops working. Passkeys made in this proof are throwaway for that reason.

## What this proof does NOT confirm

The test below is meant to settle these. None of them is proven until it runs.

- ChatGPT and Claude complete the whole sign-in against Supabase: web, project, and iPhone app.
- A passkey works inside the iPhone home-screen app, and on the sign-in page that ChatGPT and Claude open.
- "Disconnect" stops the coach at once. The proof asks Supabase on every request whether the sign-in still exists. Whether Disconnect ends that sign-in is what the test checks.
- The coach pass renews itself quietly, with no new sign-in, after it expires (about an hour).
- **Audience.** MCP asks the connector to accept only passes made for it. ChatGPT and Claude say which connector a pass is for, but Supabase does not write that into the pass. Every Supabase pass says only "authenticated". The proof makes up for this by requiring a pass from this exact Supabase project and checking with Supabase on every call. The real build should keep both checks.

## Steps only you can do

Make **new throwaway** projects. Do not use the real Chalk and Iron Supabase or Vercel project for this.

### A. Supabase (about 15 minutes)

1. Create a new Supabase project on the free plan, for example `chalk-iron-signin-proof`.
2. **Settings > JWT Keys.** If the current key says ECC (P-256), skip to step 3. If it says "Legacy HS256": click **Migrate JWT secret**, wait about 5 minutes, then click **Rotate keys**. The connector can only check passes signed this newer way.
3. **Authentication > OAuth Server.**
   - Turn the OAuth 2.1 server on.
   - Set **Authorization Path** to `/oauth/consent`.
   - Turn on **Allow dynamic client registration**.
4. **SQL Editor.** Paste all of `setup.sql` from this folder and click Run. This lets the proof show what the database sees.
5. **Settings > API Keys.** Keep this tab open. You will copy the project URL, the **publishable** key and the **secret** key in step B3.

### B. Vercel (about 10 minutes)

1. Create a new Vercel project from the GitHub repository `trantelica/chalk-and-iron`, for example named `chalk-iron-signin-proof`.
   - **Root Directory:** `proofs/connector-signin`.
   - **Framework preset:** Other.
2. Deploy the branch `phase-1-foundation`. This makes a preview. Use the preview's **branch address**, the one ending in `-git-phase-1-foundation-….vercel.app`. That address stays the same each time you redeploy.
3. **Settings > Environment Variables.** Add the following and tick **Preview**. Ticking Production too does no harm. Only names are listed here. The values come from Supabase.
   - `SUPABASE_URL`: the project URL, like `https://abcd1234.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`: never paste this anywhere else
   - `PROOF_INVITE_CODE`: any long phrase you make up. You type it on the passkey page.
   - `PUBLIC_BASE_URL`: the branch address from step 2, starting `https://`
4. **Settings > Deployment Protection.** Turn **Vercel Authentication** off for this throwaway project. If you leave it on, Vercel's own login wall blocks ChatGPT, Claude and passkeys.
5. Redeploy, so the new settings take effect.
6. Open the branch address. The readiness page should show **OK** on every line. If a line says NOT YET, it explains what to fix.

### C. Point Supabase at the Vercel address

1. **Authentication > URL Configuration.** Set **Site URL** to the branch address. Supabase sends people to that address plus `/oauth/consent` to approve a coach.
2. **Authentication > Passkeys.** Turn on **Enable Passkey authentication**.
   - **Relying Party Display Name:** `Chalk and Iron proof`.
   - **Relying Party ID:** the branch address without `https://` and without anything after the host, like `chalk-iron-signin-proof-git-phase-1-foundation-nate.vercel.app`.
   - **Relying Party Origins:** the branch address with `https://`.

### D. Passkey test

1. **iPhone, Safari.** Open the branch address plus `/passkey`.
   - Type your email and the invite code, then tap **Create account and passkey**. Approve with Face ID.
   - Tap **Sign out on this device**, then **Sign in with passkey**.
2. **iPhone, home-screen app.** In Safari tap Share, then **Add to Home Screen**. Open the app from the home screen. Tap **Sign in with passkey**. Do not create a new account.
3. **Mac.** Open `/passkey` in Safari or Chrome. Tap **Sign in with passkey**. Use the Mac's own passkey, or scan the code with your phone.
4. After each step, tap **Copy log** and paste it into your notes.

### E. ChatGPT

1. **Web.** Add a custom connector in the same place you added the Phase 0 connector. OpenAI has moved this menu during 2026. Their current docs call it **Plugins > Add custom MCP server**.
   - **URL:** the branch address plus `/mcp`.
   - **Authentication:** OAuth. Leave client registration automatic and enter no client ID.
2. ChatGPT opens the Chalk and Iron approval page. Sign in with your passkey. Check that it reads "Allow ChatGPT to read your training data and send you proposals?", then press **Allow**.
3. In a new chat, ask: "Call get_profile from the Chalk and Iron proof connector." Expect your email and `is_coach_pass: true`.
4. Ask the same inside your coach project.
5. **iPhone ChatGPT app.** Open the same project and ask again. If it asks you to connect, do it, and note whether the passkey worked on that sign-in page.

### F. Claude

1. **Web, claude.ai.** Go to **Customize > Connectors**, then **Add**, then **Add custom connector**.
   - Enter a name and the branch address plus `/mcp`.
   - **Authentication:** **Sign in now**.
   - **OAuth client:** **Register automatically**. Do not choose "Use Claude's published identity", because Supabase does not support it. If Claude marks an option **Detected**, keep it.
2. Click **Add**, then **Connect**. Sign in with your passkey and press **Allow**.
3. Ask Claude to call `get_profile`, first in a normal chat, then inside a Claude Project.
4. **iPhone Claude app.** Ask again. Note whether it needed a new sign-in.

### G. Disconnect and renewal

1. On `/passkey`, under **Connected coach apps**, you should see ChatGPT and Claude. Tap **Disconnect** on ChatGPT, then ask ChatGPT to call `get_profile` again. Expect a sign-in prompt or an error, not your profile.
2. On `/passkey`, section 5, tap **Call get_profile**. Expect `is_coach_pass: false`. This shows the connector can tell your own app sign-in apart from a coach pass.
3. The next day, ask Claude (still connected) to call `get_profile`. Expect it to work without signing in again. That shows the pass renewed itself.

### H. Send the results back

Fill in the checklist below and paste it, with the copied logs, into your next session. The Vercel project's **Logs** tab shows one `RPC` line per connector call, which helps if something fails.

## Results checklist

| # | Check | Result (yes / no / notes) |
|---|---|---|
| 1 | Readiness page all OK | |
| 2 | iPhone Safari: account and passkey created, no email arrived | |
| 3 | iPhone Safari: sign out, then sign in with passkey only | |
| 4 | iPhone home-screen app: sign in with passkey | |
| 5 | Mac: sign in with passkey (own passkey or phone code) | |
| 6 | ChatGPT web: connector added, approval page shown and allowed | |
| 7 | ChatGPT web: get_profile returns your email and is_coach_pass true | |
| 8 | ChatGPT inside your coach project | |
| 9 | ChatGPT iPhone app: works; was a new sign-in needed; did the passkey work there | |
| 10 | Claude web: connector added with "Register automatically", approval allowed | |
| 11 | Claude web: get_profile returns is_coach_pass true | |
| 12 | Claude inside a Project | |
| 13 | Claude iPhone app: works; was a new sign-in needed; did the passkey work there | |
| 14 | Disconnect stops ChatGPT at once | |
| 15 | App sign-in call shows is_coach_pass false | |
| 16 | Next day: still connected without signing in again | |
| 17 | Anything confusing on the approval page | |

## If it does not work

These follow the approved design, `docs/TECHNICAL_DESIGN.md`, Sections 4 and 10C.

- **ChatGPT or Claude cannot sign in through Supabase.** Use a sign-in company built for this. WorkOS AuthKit or Stytch Connected Apps are both sold as the OAuth server for MCP connectors. Check their current support for self-registration and client ID documents before choosing; this proof did not test them. App sign-in can stay on Supabase. The last resort is a small sign-in server written inside the app.
- **The database cannot tell a coach pass apart.** The connector enforces "read and propose only" in one guarded module, with tests.
- **Supabase's built-in passkeys fail.**
  - If they fail only on some surface, such as the home-screen app or the coach sign-in page, keep passkeys and add the emailed code as the way in there. That needs an email service and a domain.
  - If Supabase's passkeys fail outright, add passkeys with the small SimpleWebAuthn library. The server checks the passkey, then hands the browser a one-time Supabase sign-in token, the same trick `api/bootstrap.js` uses.
  - That fallback is sound, with three cautions. The secret key sits in one small server module. The one-time token must be single-use and short-lived. And Supabase would record the sign-in as "one-time code", not "passkey".

## For an agent

| File | What it is |
|---|---|
| `api/mcp.js` | `/mcp`. 401 with `WWW-Authenticate: Bearer resource_metadata="…"` when no token. Verifies the Supabase JWT against JWKS (ES256/RS256, issuer, expiry, role, aud). Calls `GET /auth/v1/user` per request so a revoked grant fails at once. One read tool, `get_profile`. |
| `api/metadata.js` | RFC 9728 protected resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`. `authorization_servers` is `<SUPABASE_URL>/auth/v1`. |
| `api/page.js` | `/` readiness checks (reads Supabase's RFC 8414 metadata and JWKS), `/oauth/consent` (uses `supabase.auth.oauth.getAuthorizationDetails / approveAuthorization / denyAuthorization`), `/passkey` (`registerPasskey`, `signInWithPasskey`, `passkey.list/delete`, `oauth.listGrants/revokeGrant`), web manifest. |
| `api/bootstrap.js` | Invite stand-in: `admin.createUser({ email_confirm: true })` then `admin.generateLink({ type: 'magiclink' })`. Returns `hashed_token`, which the browser trades with `verifyOtp({ token_hash, type })`. No email is sent. The only use of the secret key. |
| `lib/verify-token.js` | JWT check with Node's built-in crypto, no dependency. |
| `setup.sql` | `proof_whoami()` and a sample RLS table that refuses coach writes by `auth.jwt() ->> 'client_id'`. |
| `dev-server.js`, `check-local.js` | `node check-local.js` runs 14 checks against a stand-in Supabase. `node dev-server.js` serves the proof on port 3000. |

The only server dependency is `@supabase/supabase-js@2.119.0`, used by `api/bootstrap.js`. The browser pages load the same version from jsDelivr.

## Sources

Opened on 17 November 2026:

- Supabase: [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [OAuth 2.1 server getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OAuth token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security), [Passkeys](https://supabase.com/docs/guides/auth/passkeys), [Passkeys beta changelog](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- Supabase Auth source, read for what it really publishes:
  - [internal/api/jwks.go](https://github.com/supabase/auth/blob/master/internal/api/jwks.go): the metadata has a registration endpoint when dynamic registration is on, no client ID metadata document flag, and token auth `none`, `client_secret_basic` and `client_secret_post`.
  - [internal/api/oauthserver/authorize.go](https://github.com/supabase/auth/blob/master/internal/api/oauthserver/authorize.go): the `resource` value is checked but not written into the token.
- Supabase JavaScript library 2.119.0, the package itself: the method names used above.
- OpenAI: [Apps SDK authentication](https://developers.openai.com/apps-sdk/build/auth), [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- Anthropic: [Authentication for connectors](https://claude.com/docs/connectors/building/authentication), [Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom/add-unlisted)
