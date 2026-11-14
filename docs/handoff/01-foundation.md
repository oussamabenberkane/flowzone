# Handoff 01: Foundation

Status: **code complete and verified locally; waiting on the owner for the account-level steps** (first push approval, Google credentials, Vercel project, Neon database). Nothing has been pushed. See [section 3](#3-what-you-the-owner-must-do-in-order) for the exact steps and [section 7](#7-verification-done-and-what-is-still-open) for what is and is not proven yet.

## 1. What was built

- **Repository**: git initialised on `main`, `origin` set to `https://github.com/oussamabenberkane/flowzone.git` (the remote is empty, so nothing could be overwritten). MIT `LICENSE`, `.gitignore` that ignores every `.env*` file except `.env.example`, `.gitattributes` (LF line endings). Local commits only.
- **App**: Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript strict, ESLint 9 + Prettier. Folder layout is documented in `docs/contracts/foundation.md` section 1.
- **Settings**: one validated module (`src/server/env.ts`) that stops the app at startup with a clear list of what is wrong (never values). `.env.example` documents every variable.
- **Database**: Drizzle ORM on Postgres through the standard `pg` driver (works with Neon and with any self-hosted Postgres). First migration (`drizzle/0000_auth_tables.sql`) creates only the four auth tables. `npm run db:migrate` works locally; on Vercel `npm run vercel-build` migrates before building.
- **Sign-in**: Better Auth, Google only, closed sign-up via `ALLOWED_EMAILS`, secure cookie sessions (30 days), sign-out, route protection (`src/proxy.ts` as first filter, real checks in pages and API routes).
- **User-scoped data access**: `forUser(user)` is the only approved way to touch user data; `userOwnedTable()` is the only way to declare such a table; ESLint blocks every bypass. Idempotent creates are built in.
- **API conventions**: `userRoute` / `publicRoute` wrappers, the standard error shape and codes, safe logging.
- **Test-only login**: `POST /api/auth/test-login`, with three independent guards against production.
- **Placeholders**: signed-out `/sign-in`, signed-in `/` (shows the email, sign-out button), `GET /api/health`. Frontend Core replaces the look.
- **Security**: HSTS, nosniff, no framing, referrer policy, permissions policy and a baseline CSP on every response; HTTPS-only cookies off localhost.

## 2. Run it locally

1. `npm install` (see the OneDrive warning in section 6; the first install took about 13 minutes inside OneDrive).
2. Copy `.env.example` to `.env.local` and fill it in (database strings from your **dev** Neon branch, a fresh `BETTER_AUTH_SECRET`, Google credentials, the two emails). Put `APP_ENV=development` in `.env.local` so `npm run build` / `npm start` work on your machine.
3. `npm run db:migrate`, then `npm run dev` and open http://localhost:3000.
4. Before committing: `npm run check` (lint, type check, format check) and `npm run build`.

Useful: `npm run db:generate` (new migration from schema changes), `npm run db:studio`, `npm run script -- scripts/<file>.ts` (run a server-side script).

## 3. What you (the owner) must do, in order

Do not paste any secret into a chat or a file in the repository. Secrets go only into Vercel's Environment Variables page and your own `.env.local`.

**Step 1. Approve the first push.** Reply with an explicit go-ahead. The agent will then run `git push -u origin main`. Before you do, decide about the files that were already in the folder and that I did **not** commit: `agents/`, `assets/` and `AGENT_INTRO_MEDIA.md` (planning briefs and media). They would become public once the repository is public, so tell me if you want any of them committed (and whether the repository will be public or private).

**Step 2. Create the Vercel project** (vercel.com, Hobby plan). Add New → Project → import `oussamabenberkane/flowzone` (allow Vercel's GitHub app to see it). Leave the framework as Next.js and the build settings at their defaults (Vercel automatically uses the `vercel-build` script). Press Deploy. **The first deployment is expected to fail** with "FlowZone cannot start: the environment is not configured correctly", because the settings do not exist yet. Then open Settings → Domains and note your production address (`https://<name>.vercel.app`). You need it in step 3.

**Step 3. Create the Google sign-in credentials** (console.cloud.google.com; menu names may differ slightly).

1. Create a project (for example "FlowZone").
2. Google Auth Platform (or "APIs & Services → OAuth consent screen"): app name "FlowZone", your support email, audience **External**.
3. Clients (or "Credentials") → Create → **OAuth client ID** → type **Web application**. Under **Authorized redirect URIs** add exactly these two:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-production-address>/api/auth/callback/google`
4. Copy the Client ID and Client secret somewhere private (you will paste them into Vercel and `.env.local` only).
5. Audience → **Publish app** (to "In production"). FlowZone only asks for the basic profile and email, which needs no Google review, and this avoids the "unverified app" warning and the 7-day limit of "Testing" mode. If you prefer to stay in Testing, add the two allowed emails as **Test users** instead.
6. Preview deployments use random addresses that Google cannot be told about in advance, so **Google sign-in does not work on preview URLs** (see section 6).

**Step 4. Create the database through Vercel.** Vercel project → Storage → Create Database → **Neon** (Marketplace). Choose a region close to your Vercel Function Region (Settings → Functions; the default is Washington D.C.; if you are elsewhere, pick the same area for both), pick the free plan, then connect it to the project for **Development, Preview and Production**. Under "Create database branch for deployment" turn **Preview ON** and leave **Production OFF**. Vercel then fills in `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.

**Step 5. Keep real data out of previews and local work.** In the Neon console (Storage → your database → "Open in Neon"):

1. Create a branch named `dev` (from `main` while it is still empty).
2. Make `dev` the project's **default branch** (Branches → ⋮ → Set as default). Preview deployments are copied from the default branch, so they will start from the empty `dev` instead of copying real people's data.
3. Back in Vercel (Storage → your database → settings) confirm the **Production branch** is still `main`. If it is not, set it to `main`.
4. From the `dev` branch's "Connect" panel copy the **pooled** string and the **direct (non-pooled)** string into your `.env.local` as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. If the string ends with `&channel_binding=require` and connections fail, remove that part.

**Step 6. Add the settings in Vercel** (Project → Settings → Environment Variables; mark secrets as Sensitive):

| Name                   | Value                                                                                                                                                                            | Environments        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `BETTER_AUTH_SECRET`   | a long random value (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`); use a **different** one for Production and for Preview | Production, Preview |
| `BETTER_AUTH_URL`      | `https://<your-production-address>`                                                                                                                                              | Production only     |
| `GOOGLE_CLIENT_ID`     | from step 3                                                                                                                                                                      | Production, Preview |
| `GOOGLE_CLIENT_SECRET` | from step 3                                                                                                                                                                      | Production, Preview |
| `ALLOWED_EMAILS`       | the two emails, comma separated, for example `first@…,second@…`                                                                                                                  | Production, Preview |

Do **not** set `ENABLE_TEST_LOGIN` or `APP_ENV` in Vercel at all. (The database variables are already there from step 4.)

**Step 7. Redeploy** (Deployments → the failed one → Redeploy, or push any commit). Then open `https://<your-production-address>/api/health`: it should say `{"status":"ok","checks":{"app":"ok","database":"ok"}}`.

**Step 8. Check sign-in for real** (this is the checkpoint from `AGENTS_INDEX.md`). On the production address: (a) sign in with each of the two allowed Google accounts and sign out; (b) try a third Google account and confirm you see "That Google account isn't on the invite list yet…" and no account is created; (c) visit `/` while signed out and confirm you are sent to the sign-in page. Tell the agent the results so this note can be updated.

## 4. Environment variables added

`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `ENABLE_TEST_LOGIN`, `APP_ENV`. All explained in `.env.example`. Vercel supplies `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`.

## 5. Decisions and deviations

- **Auth library: Better Auth** (no deviation; Auth.js was not needed). It supports Drizzle, Google-only sign-in, database hooks (used for the closed sign-up) and plugins (used for the test login).
- **`APP_ENV` (addition).** `next build` and `next start` always run with `NODE_ENV=production`, so "production" cannot be told from the process alone. `APP_ENV` is derived from `VERCEL_ENV` on Vercel (production there cannot be overridden) and from `NODE_ENV` elsewhere; setting `APP_ENV=development|test` is how a developer opts a local production build out of production rules. An unrecognised value counts as production.
- **Test login is a small custom Better Auth plugin**, not Better Auth's own `testUtils` plugin, because `testUtils` exposes no HTTP endpoint and works only from code in the same process, which would force Playwright to import the server code and connect to the database itself.
- **`pg` driver, not Neon's serverless driver**, so the app stays self-hostable on any Postgres. Pooling: pooled `DATABASE_URL` at runtime with a small pool per instance, `attachDatabasePool` from `@vercel/functions` for Vercel's Fluid compute; direct string only for migrations.
- **Migrations run in `vercel-build`** (before `next build`) with a Postgres advisory lock. A migration failure fails the deployment.
- **Database separation**: Neon branches (free plan). `main` = production, `dev` = local work and the source for preview branches (steps 4 and 5). This is the cheapest safe option and needs no second database.
- **Versions**: Next 16.4.6, Better Auth 1.7.23, Drizzle 0.45 / drizzle-kit 0.31, Zod 4. Two deliberate non-latest choices: **TypeScript 5** (typescript-eslint does not support TypeScript 7 yet) and **ESLint 9** (the React/import lint plugins used by `eslint-config-next` do not support ESLint 10 yet).
- **Cache Components is on** (the Next.js 16.4 default, and the only mode in the next major version). Pages that read the session wrap that part in `<Suspense>`. Documented in the contract.
- **Preview-deployment sign-in is not supported** (Google cannot allow random preview addresses). Better Auth's OAuth Proxy plugin can route previews through production but needs a secret shared between all environments, which I judged not worth the risk for v1.
- **`LICENSE`** names "FlowZone contributors" as the copyright holder; change it to your name if you prefer.
- **Session/context split**: `src/server/auth/session.ts` (no Next imports, used by API routes and scripts) vs `current-user.ts` (pages).
- The scaffold's `AGENTS.md` (tells coding agents to read the bundled Next.js docs) is kept and committed on purpose.

## 6. Known limitations and warnings

- **OneDrive warning.** The project lives in a OneDrive-synced folder. `node_modules` (tens of thousands of files) and `.next` will be synced, can be locked mid-install or mid-build, and slow everything down: the first `npm install` here took about 13 minutes (about 5 minutes outside OneDrive). Strongly recommended: **move the project outside OneDrive** (for example `C:\dev\flowzone`), or at least stop OneDrive syncing `node_modules` and `.next` (OneDrive → Settings → Sync and backup → Manage backup / "Choose folders", or keep the whole project folder out of sync). If you see random `EBUSY` / `EPERM` errors, this is why.
- **Not proven yet (needs your accounts):** real Google sign-in on a deployed site, the Neon connection (including whether Neon's connection string needs any tweak for `pg`), the Vercel build and deployment, and the preview-branch flow. Everything else was verified locally (section 7).
- Google sign-in on **preview URLs** does not work (see above). Previews still load and `/api/health` works there.
- If the settings are wrong or test login is switched on in production, `next start` keeps the process up but answers every request with 500 and logs the reason (on Vercel the deployment simply serves errors until fixed).
- Isolation between people is enforced in application code (scoped layer, types, lint). There is no database-level row security. That is a possible later hardening, not part of v1.
- Better Auth's built-in rate limiter keeps counters in memory per server instance. Because sign-in is Google-only and closed, this is not a practical concern.
- Test users created by the test login stay in the database until deleted (development databases only).
- The `/`, `/sign-in` pages are placeholders with minimal styling by design.

## 7. Verification done, and what is still open

Done by the Foundation agent on this machine, against a throwaway Postgres 17 in Docker (not your Neon), with placeholder Google credentials:

| Check                                                                                                                                                                                                                                                                                                                              | Result                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`                                                                                                                                                                                                                                                       | all pass with no warnings                                                                                                                                      |
| Fresh database built from migrations alone; re-running is a no-op; auth tables exist                                                                                                                                                                                                                                               | pass                                                                                                                                                           |
| `GET /api/health`                                                                                                                                                                                                                                                                                                                  | `200 {"status":"ok","checks":{"app":"ok","database":"ok"}}`; security headers present                                                                          |
| Signed-out visit to `/`                                                                                                                                                                                                                                                                                                            | redirected to `/sign-in`; signed-out API call returns the standard `401`                                                                                       |
| "Continue with Google" in a real browser                                                                                                                                                                                                                                                                                           | goes to Google with the correct callback `…/api/auth/callback/google` and the account chooser (Google then rejects the **placeholder** client id, as expected) |
| **Real OAuth callback code path** (Google's token request faked in-process): allow-listed email                                                                                                                                                                                                                                    | signed in, session cookie set, account created; same address in other letter case is the same person                                                           |
| Non-listed email                                                                                                                                                                                                                                                                                                                   | refused: redirected to `/sign-in?error=not_allowed`, **no account created**, no session cookie                                                                 |
| Email removed from the allow-list afterwards                                                                                                                                                                                                                                                                                       | cannot start a new session **and** the existing session stops working (`not-allowed`)                                                                          |
| Friendly refusal message on `/sign-in?error=not_allowed`                                                                                                                                                                                                                                                                           | shown (checked in a real browser)                                                                                                                              |
| Sign-in via test login, home page shows the email, sign-out button, back to `/sign-in`                                                                                                                                                                                                                                             | pass (real browser, production build)                                                                                                                          |
| Data scoping against a scratch table (since removed): isolation of list/read/update/delete between two users, cannot set `user_id`, forged context and non-`userOwnedTable` tables rejected, idempotent retry returns the same row, 8 concurrent retries produce 1 row, transactions roll back, `removeAll` and cascade are scoped | 26/26 pass                                                                                                                                                     |
| ESLint blocks importing the raw database client, `pg`, `mintUserContext`, or server code from `src/ui`                                                                                                                                                                                                                             | pass (probed, probes removed)                                                                                                                                  |
| Standard error shape for 400 (bad JSON, validation with field list), 401, 404, 409, 500 through a probe route (removed)                                                                                                                                                                                                            | pass                                                                                                                                                           |
| A failing request that contained private text, and a database error that echoed an email, leave **no** personal text in the logs (only error type, SQLSTATE code, constraint, table, stack frames)                                                                                                                                 | pass                                                                                                                                                           |
| Test login refused in production: Vercel production + flag, with `APP_ENV=test` trying to override, plain production build + flag. Flag off in production. Request-time guard across 11 environment combinations                                                                                                                   | app refuses to start and the endpoint is unreachable; with the flag off the endpoint is `404`; all 11 combinations correct                                     |
| Test login works with the flag on locally (dev server and local production build)                                                                                                                                                                                                                                                  | pass                                                                                                                                                           |

**Still open until you complete section 3:** deployment to Vercel (production and preview), the Neon database, real Google sign-in for the two allowed accounts and the refusal of a third, and the production health check. Please send me the results of step 8 so I can record them here.

## 8. First things the Backend agent should read

1. `docs/contracts/foundation.md` (the rulebook: scoped data access, adding a table, error and idempotency conventions, test login, environment variables).
2. `src/server/db/user-owned-table.ts` and `src/server/db/scoped.ts` (short; the code is the specification).
3. `src/server/http/route.ts` and `src/server/http/errors.ts` (how every API route is written).
4. `.env.example` (add your own variables the documented way).
5. `node_modules/next/dist/docs/` for anything about Cache Components, route handlers or proxy (this Next.js version differs from older ones).
