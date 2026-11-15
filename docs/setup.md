# Setup guide

This guide takes you from an empty folder to a running FlowZone, with your own accounts and keys. Follow it in order. Every setting is listed in [`.env.example`](../.env.example), which is the single list; this guide says where each one comes from.

Written for: a developer who will self-host FlowZone with their own Google, database and (optional) AI keys.

## 1. What you need

| Thing                                                                      | Why                                                                         | Cost                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| Node.js 20.19 or later (the project was tested on 24) and npm              | build and run the app                                                       | free                                          |
| Git                                                                        | get the code                                                                | free                                          |
| A Google account and a Google Cloud project                                | Google sign-in (the only way to sign in)                                    | free                                          |
| A Postgres database: Neon (free plan, through Vercel) or your own Postgres | stores the data                                                             | free tier                                     |
| A Vercel account (Hobby)                                                   | hosts the app (optional: any Node host that runs `next start` works)        | free                                          |
| A GitHub repository                                                        | runs the nudge scheduler (optional)                                         | free                                          |
| Docker (optional)                                                          | a throwaway local Postgres for development and tests                        | free                                          |
| OpenSSL                                                                    | makes the test certificate for the push tests (Git for Windows includes it) | free                                          |
| An AI provider key (optional)                                              | AI features; FlowZone works fully without it                                | Groq has a free tier; check its current terms |

## 2. Get the code and install

```bash
git clone https://github.com/<you>/flowzone.git
cd flowzone
npm install
```

On Windows inside OneDrive, installs and builds are slow and can fail with `EBUSY`/`EPERM`. Keep the project outside OneDrive (for example `C:\dev\flowzone`).

## 3. Create the environment file

```bash
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local
```

`.env.local` is git-ignored. Never commit it. Blank values count as "not set".

Fill in the values as you complete sections 4 to 7. The variables are:

| Name                                                              | Required                           | Where it comes from                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                    | yes                                | Neon **pooled** string, or your Postgres URL (section 5)                                                                           |
| `DATABASE_URL_UNPOOLED`                                           | recommended                        | Neon **direct** string (section 5). Falls back to `DATABASE_URL`                                                                   |
| `BETTER_AUTH_SECRET`                                              | yes                                | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` (use a different value per environment) |
| `BETTER_AUTH_URL`                                                 | yes locally, recommended on Vercel | `http://localhost:3000` locally; `https://<your-address>` in production                                                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                        | yes                                | Google Cloud (section 4)                                                                                                           |
| `ALLOWED_EMAILS`                                                  | yes                                | comma-separated Google addresses allowed to sign in. Everyone else is refused                                                      |
| `APP_ENV`                                                         | local production builds only       | `development`, see section 8                                                                                                       |
| `ENABLE_TEST_LOGIN`                                               | never in production                | `true` only on your machine, for the tests (section 9)                                                                             |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_DAILY_REQUEST_LIMIT` | optional                           | section 6. Default `none` (no AI)                                                                                                  |
| `NUDGE_TICK_SECRET`                                               | optional (needed for nudges)       | section 7                                                                                                                          |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`          | optional (needed for push)         | section 7                                                                                                                          |
| `NUDGE_TEST_CLOCK`                                                | never in production                | `true` only for the tests (section 9)                                                                                              |

Variables set by Vercel itself (`VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL`) must not be set by you.

## 4. Google sign-in

Sign-in is Google only. Sign-up is closed: only the addresses in `ALLOWED_EMAILS` get an account.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (for example "FlowZone").
2. **Google Auth Platform** (or "APIs & Services → OAuth consent screen"): app name "FlowZone", your support email, audience **External**. FlowZone asks only for the basic profile and email, which needs no Google review.
3. **Clients → Create → OAuth client ID → Web application**. Under **Authorized redirect URIs** add exactly:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-production-address>/api/auth/callback/google`
4. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (in `.env.local` and in Vercel only).
5. **Audience → Publish app** ("In production"). This avoids the 7-day limit of "Testing" mode. Alternatively keep Testing and add your allowed addresses as test users.

Google sign-in does not work on preview deployment addresses, because Google cannot be given their random addresses in advance. Use production for it.

## 5. Database

**Option A: Neon through Vercel (recommended).** On your Vercel project: Storage → Create Database → Neon. Connect it to Development, Preview and Production. Vercel fills in `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. For safety, create a `dev` branch in Neon and make it the default branch, so previews and local work never touch production data. Copy the pooled and direct strings of the `dev` branch into `.env.local`.

**Option B: a local Postgres 17 with Docker (for development and tests).**

```bash
docker run -d --name flowzone-pg -e POSTGRES_USER=flowzone -e POSTGRES_PASSWORD=<choose-a-password> \
  -e POSTGRES_DB=flowzone -p 54320:5432 postgres:17-alpine
```

Then `DATABASE_URL=postgresql://flowzone:<choose-a-password>@localhost:54320/flowzone` (and the same for `DATABASE_URL_UNPOOLED`).

Apply the migrations (safe to repeat):

```bash
npm run db:migrate
```

## 6. AI (optional)

FlowZone is a normal todo app with AI off. Turning AI on needs a provider key and a choice from the person in the app (four switches, all off by default).

1. Create an account with a provider and an API key. The tested provider is **Groq** (`openai/gpt-oss-20b`). Before real use, check its free-plan limits and its data-retention settings: Groq may keep inputs and outputs for up to 30 days unless you change its data controls.
2. In `.env.local` (and in Vercel for Production and Preview): `AI_PROVIDER=groq` and `AI_API_KEY=<your key>`.
3. Other providers: `mistral` or `openrouter` (`openrouter` also needs `AI_MODEL`). See [docs/contracts/ai.md](contracts/ai.md), section 1.
4. `AI_DAILY_REQUEST_LIMIT` caps the AI requests per person per day (default 30).

The app refuses to start if a real provider is named without a key, and refuses `AI_PROVIDER=standin` in production.

## 7. Nudges and web push (optional)

Nudges are gentle reminders. They are sent by a scheduler that calls the tick endpoint every 30 minutes, and they go to devices that the person allows. Without these settings the app runs and no nudges are sent.

1. **Tick secret.** Generate one value and use it in two places:
   - `NUDGE_TICK_SECRET` in `.env.local` and in Vercel (Production).
   - A GitHub repository **secret** named `NUDGE_TICK_SECRET` (repository → Settings → Secrets and variables → Actions).
2. **Scheduler address.** A GitHub repository **variable** named `FLOWZONE_APP_URL` with your production address and no trailing slash (for example `https://your-domain`).
3. **Web push keys.** Generate once, for this app only:

   ```bash
   npx web-push generate-vapid-keys
   ```

   Put `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `.env.local` and Vercel. Set `VAPID_SUBJECT` to `mailto:you@example.com` (your own contact address; it is sent to the browser vendors' push services). Set all three or none.

4. The workflow is `.github/workflows/nudges-tick.yml`. It runs every 30 minutes and on demand (Actions → "Nudges tick" → Run workflow). GitHub may delay scheduled runs.

**Known blocker (defect D-01):** the app's route guard (`src/proxy.ts`) refuses calls to `/api/nudges/tick` that carry no session cookie, so the scheduler's calls are refused until that path is allowed. See [docs/qa/defects.md](qa/defects.md). Do not set `NUDGE_TEST_CLOCK` anywhere but tests.

## 8. Run locally

```bash
npm run db:migrate
npm run dev                       # http://localhost:3000
```

Open http://localhost:3000 and sign in with Google (an address in `ALLOWED_EMAILS`).

Development (`npm run dev`) runs the app without the offline service worker, by design. To try offline behaviour or install the app, run a production build:

```bash
# .env.local must contain APP_ENV=development, because `next build` and `next start`
# run with NODE_ENV=production and would otherwise refuse test settings and need https.
npm run build && npm start
```

Optional sample data for your first two allowed addresses (development databases only; it replaces their existing core data):

```bash
npm run script -- scripts/seed.ts
```

The seed script refuses to run unless `APP_ENV` is `development` or `test`, and refuses on Vercel.

## 9. Run the tests

The suite is Playwright only (functional tests, accessibility scans, and isolation checks through direct API calls). It never uses Google, real AI quota or a production database. Full details: [docs/testing.md](testing.md).

Short version:

1. Start a **local, disposable** test database (Docker, as in section 5, Option B), with a name containing `test`, for example `flowzone_test`.
2. Install the browser once: `npx playwright install chromium`.
3. Run:

   ```bash
   E2E_DATABASE_URL="postgresql://flowzone:<password>@localhost:54320/flowzone_test" npm run test:e2e
   ```

The suite starts its own server on port 3100 with test-only settings (`APP_ENV=test`, `ENABLE_TEST_LOGIN=true`, `AI_PROVIDER=standin`, `NUDGE_TEST_CLOCK=true`). It removes every test account when it finishes.

## 10. Deploy to Vercel

1. Push the repository to GitHub. On Vercel: Add New → Project → import the repository. Keep the framework as Next.js and the default build settings (Vercel runs `npm run vercel-build`, which applies migrations first and then builds).
2. Add the variables from section 3 under Settings → Environment Variables. Mark secrets as Sensitive. Use **Production** for `BETTER_AUTH_URL`; set `BETTER_AUTH_SECRET`, Google, `ALLOWED_EMAILS`, AI and push values for Production (and Preview if you want previews to work, except Google sign-in).
   - Never set `ENABLE_TEST_LOGIN`, `NUDGE_TEST_CLOCK` or `APP_ENV` on Vercel.
   - Never set `AI_PROVIDER=standin` on Vercel (it is refused).
3. Deploy. Then open `https://<your-address>/api/health`. It should show `{"status":"ok","checks":{"app":"ok","database":"ok"}}`.
4. Sign in with each allowed account, and check that a third Google account is refused (the "invite list" message).

## 11. Troubleshooting

| Symptom                                                                           | Likely cause                                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "FlowZone cannot start: the environment is not configured correctly."             | a required variable is missing or malformed. The message names the variable (never its value) |
| `npm run build` or `npm start` answers 500 and the log says test login is refused | `APP_ENV` is not set to `development` locally, or a test flag is set in production            |
| Sign-in goes to Google and back with an error                                     | the redirect URI in Google differs from `<BETTER_AUTH_URL>/api/auth/callback/google`          |
| `EBUSY` / `EPERM` during install or build                                         | the project is inside OneDrive; move it out                                                   |
| Service worker not active                                                         | you are on `npm run dev`; use a production build                                              |
| Nudges never arrive                                                               | check section 7, and defect D-01                                                              |
