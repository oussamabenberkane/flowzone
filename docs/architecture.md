# Architecture overview

FlowZone is a Next.js 16 app (App Router, React 19, TypeScript strict) with a Postgres database through Drizzle ORM. It is a personal productivity app, mainly for people with ADHD or focus struggles: calm, low-friction, and never guilt-inducing. Tasks are the foundation. AI chat, notes and the journal complement them, and are opt-in.

This page explains how the parts fit together. The rules themselves live in the contracts, which are the single source of truth. Read them, do not copy them.

| Contract                                                      | Covers                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [docs/contracts/foundation.md](contracts/foundation.md)       | project map, the user-scoping rule, sign-in, API conventions, test login, environment variables          |
| [docs/contracts/api.md](contracts/api.md)                     | every REST endpoint, the resource shapes, task and recurrence rules, quick-add grammar, tuning constants |
| [docs/contracts/design-system.md](contracts/design-system.md) | River tokens, components, themes, motion, the nine extension slots, test hooks                           |
| [docs/contracts/ai.md](contracts/ai.md)                       | the AI provider, opt-in, tiers, the action log, features, the stand-in                                   |
| [docs/contracts/nudges.md](contracts/nudges.md)               | the nudge engine, the tick endpoint, push delivery, limits                                               |

## 1. Components

```
Browser (installable PWA)
  src/ui/            React screens and components (never imports src/server)
  public/sw.js       service worker: page copies, static assets, push hook
  IndexedDB          offline captures and a copy of Today (per person)
        │  JSON over HTTPS (session cookie)
        ▼
Next.js server
  src/proxy.ts       first-line guard: is there a session cookie?
  src/app/           pages (Server Components) and API routes (src/app/api/**)
  src/server/        infrastructure: auth, the scoped database layer, env, logging, push
  src/services/      domain logic: tasks, projects, entries, today, settings, AI, nudges, lifecycle
  src/shared/        types, schemas, constants used by browser and server (no server imports)
        │
        ▼
Postgres (Neon or your own)           Push services (browser vendors)
  src/server/db/schema/               reached only by the nudge engine
        ▲
        │  POST /api/nudges/tick (every 30 minutes, shared secret)
GitHub Actions  .github/workflows/nudges-tick.yml
```

The layers only point one way: routes call services, services call the scoped database layer, and the browser never sees server code. ESLint enforces the boundaries.

## 2. The user-scoping rule

Every person's data is reached through one function, `forUser(user)` (`src/server/db/scoped.ts`):

- It needs a `UserContext`, which can only come from the signed-in session (`userRoute`, `requirePageUser`) or from trusted background work (`contextForUser`, `listUserContexts`). It cannot be built by hand.
- Every query adds `WHERE user_id = <that person>`. New rows take `user_id` from the context, never from the request.
- Only tables made with `userOwnedTable()` are accepted. Those tables have the owner column and cascade on delete.
- The raw database client is fenced off (`src/server/db/raw.ts`). ESLint refuses imports of it outside the database and auth code.

Access to another person's item is answered as **not found** (404), the same answer as for an id that does not exist. The suite proves this for every user-owned resource with direct API calls (`e2e/isolation.spec.ts`). Isolation is enforced in application code, not by database row security; that is a possible later hardening.

## 3. Requests and responses

- Every API route is wrapped in `userRoute` (needs a session on the allow-list) or `publicRoute` (health, and the nudge tick with its own secret).
- Errors use one shape: `{ error: { code, message, traceId } }`. Codes are stable; messages are calm and never contain database text.
- Creates from user input carry a client request id (`clientRequestId`). A retry with the same id returns the existing row (201 first time, 200 on a retry). The offline queue relies on this.
- Logs contain event names, route, trace id and error types only, never task text, notes, chat or names.

## 4. Sign-in and the allow-list

Google is the only sign-in. Sessions are database-backed cookies (30 days, sliding). Sign-up is closed: an email must be in `ALLOWED_EMAILS` to get an account or a session. The check runs when an account is created, when a session starts, and on every request, so removing an address locks that person out at once.

Test users (`@test.flowzone.invalid`) can sign in only through the test-only login, which is switched on only by `ENABLE_TEST_LOGIN` outside production. It has three independent guards: startup refuses the combination, the endpoint is registered only when allowed, and each request re-checks the environment.

## 5. The AI: consent and risk tiers

- **Four switches, all off by default:** `ai_features` (Tasks and chat), `ai_notes_journal` (the assistant may read notes and the journal), `ai_profile` (the assistant may read and propose profile lines), `nudges`. A person can always see and change their own data; the switches govern what the AI may do and read.
- **Opt-in is enforced on the server** before any provider call. With the switch off the chat answers `not_opted_in` and sends nothing.
- **Context is minimal.** The context builder includes only what the switches allow.
- **Tiers are decided in code, never by the model.** Low-risk changes (creating or updating a task, adding a note, moving up to three tasks to today, breaking a task into steps, a profile proposal) apply at once and can be undone. Confirm-tier changes (deleting a task, bulk completion, moving more than three items in one turn, editing or deleting notes and journal entries) wait in a pending list until the person confirms or rejects them. Pending items expire after 24 hours.
- **The model cannot run a tool outside its registry,** and arguments are checked with a strict schema before anything runs.
- **Limits and calm failures.** A daily cap per person (default 30 requests) and a provider failure both answer "AI is resting", with everything else still working.
- **Stand-in mode** (`AI_PROVIDER=standin`) runs the same tool layer with scripted replies, so tiers, the action log and undo are exercised by the tests without any quota. It is refused in production.

## 6. Nudges and the scheduler

- The **engine** (`src/services/nudges/`) decides, for each person and each 30-minute window, whether to send at most one nudge. Rules, in order: the switch is on; not quiet hours (default 21:00 to 08:00 in the person's time zone); under three nudges that day; the task is not muted or snoozed and was not nudged in the last 72 hours; a task is due soon, with a reason. Each nudge says why ("… is due at …") and never uses guilt wording.
- **Idempotent per window.** Each decision reserves its window in the nudge log, so a second call in the same window sends nothing.
- **The scheduler** is a GitHub Actions workflow that calls `POST /api/nudges/tick` with the shared secret. The endpoint returns counts only, never ids, titles or endpoints. It answers 404 when no secret is set.
- **Test-only clock.** `?asOf=` lets tests evaluate a chosen time, only when `NUDGE_TEST_CLOCK` is on and the deployment is not production.
- **Delivery** uses standard Web Push with VAPID keys. A device that answers "gone" is removed; a failed send is logged and does not use up the day's allowance.

## 7. Offline

- **Capture** saves to IndexedDB, tagged with the owner, and is sent with its own request id when the connection returns. A capture is only ever sent with its owner's session.
- **Today** is saved on the device after each good load and shown read-only when offline.
- **The service worker** keeps app pages network-first with the last good copy as a fallback, and built assets cache-first. `/api/*` is never cached. Sign-out clears the device's copies.

## 8. Settings, accessibility and theming

- Accessibility choices (text size, dyslexia-friendly font, less motion) are per device and applied before first paint. Reduced motion from the system is always respected.
- Light and dark themes follow the system. Colours are tokens in `src/app/globals.css`.
- Extension slots (`src/ui/extensions/slots.tsx`) let the AI and Nudges features fill places in the screens without changing them; when a slot is empty the manual version is shown.

## 9. Data lifecycle

Every feature registers a lifecycle handler (`src/services/lifecycle/registry.ts`). Export (`GET /api/account/export`) writes one ZIP of JSON and readable Markdown, and deletion (`POST /api/account/delete`, with the exact text `DELETE`) removes every row and the account, then signs out. Deletion is immediate and irreversible.

## 10. Where to look

| Need                                         | Start at                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| add an endpoint or table                     | foundation contract, sections 3 and 5; `src/app/api/tasks/route.ts` as the example |
| change a rule (recurrence, Today, quick-add) | `src/services/rules/` and api contract section 3                                   |
| change a tier or add an AI tool              | `src/services/ai/tools.ts` and ai contract section 6                               |
| change a screen                              | `src/ui/` (River components) and design-system contract                            |
| change tuning values                         | `src/shared/tuning.ts`, `src/shared/ai.ts`, `src/shared/nudge-tuning.ts`           |
| add a setting                                | `src/server/env.ts` and `.env.example` (both, always)                              |
