# Foundation contract

Owner: the Foundation agent (Agent 1). **Read-only for everyone else.** If something here blocks you, write the problem in your handoff note instead of editing this file.

This document is the rulebook for the parts every other agent builds on: how data is kept private per person, how API routes behave, how sign-in works, how tests sign in, and how settings (environment variables) are handled.

Contents: [1 Project map](#1-project-map) · [2 Golden rule: user-scoped data](#2-golden-rule-user-scoped-data-access) · [3 Adding a table](#3-adding-a-new-user-owned-table) · [4 Table conventions](#4-table-conventions) · [5 API routes](#5-api-routes) · [6 Errors](#6-the-error-response-convention) · [7 Idempotent creates](#7-idempotent-creates) · [8 Sign-in and pages](#8-sign-in-sessions-and-pages) · [9 Test-only login](#9-test-only-login) · [10 Environment variables](#10-environment-variables) · [11 Migrations](#11-database-and-migrations) · [12 Logging](#12-logging-and-privacy) · [13 Next.js notes](#13-nextjs-notes)

---

## 1. Project map

```
src/
  app/            Next.js routes: pages and API route handlers (src/app/api/**/route.ts)
  ui/             Browser components. Never imports from src/server.
  shared/         Types and constants used by both browser and server (error shape, ids).
                  Never imports from src/server.
  services/       Domain logic (tasks, notes, ...). Empty for now. Server-only.
  server/         Server-only infrastructure. Everything in here starts with `import "server-only"`.
    env.ts          the ONE place settings are read and validated
    log.ts          privacy-safe logging
    auth/           Better Auth, current user, allow-list, test login
    db/             database: schema/, user-owned-table.ts, scoped.ts (approved access), raw.ts (restricted)
    http/           errors.ts and route.ts (request context + standard errors for API routes)
  proxy.ts        first-line route guard (cookie present?)
  instrumentation.ts  validates settings at server start; logs request errors safely
drizzle/          generated SQL migrations (commit them)
scripts/          command-line scripts (migrate.ts)
docs/contracts/   contracts (one owner each)   docs/handoff/   handoff notes
```

Where things go: a new feature's logic lives in `src/services/<area>/`, its tables in `src/server/db/schema/<area>.ts`, its endpoints in `src/app/api/<area>/.../route.ts`, its screens in `src/app/` and `src/ui/`.

---

## 2. Golden rule: user-scoped data access

**All reading and writing of user data goes through `forUser(user)` from `@/server/db/scoped`.** Nothing else. A person must never be able to see or change another person's rows, even by mistake.

```ts
import { forUser } from "@/server/db/scoped";

const scope = forUser(user); // `user` is a UserContext
const open = await scope.list(tasks, { where: eq(tasks.done, false), orderBy: tasks.createdAt });
const { row, created } = await scope.create(tasks, { title: "Call Sam" }, { clientRequestId });
```

### Why it is safe by design

1. **You cannot call it without a user.** `forUser` needs a `UserContext`, a type that cannot be written by hand. It only comes from `requireUser()` / `userRoute()` (API), `requirePageUser()` (pages) or `system-context.ts` (trusted background work). ESLint blocks creating one any other way.
2. **The owner filter is automatic.** Every operation adds `WHERE user_id = <that person>` internally; there is no switch to turn it off. New rows take `user_id` from the context, never from request data. Trying to set `userId` yourself throws.
3. **Only proper tables are accepted.** It only works on tables made with `userOwnedTable()` (section 3), which guarantees the owner column exists.
4. **The raw database client is fenced off.** It lives in `src/server/db/raw.ts`. ESLint refuses imports of it (and of `pg` / `drizzle-orm/node-postgres`) outside `src/server/db`, `src/server/auth`, the health route and `scripts/`. No function in the scoped layer returns it.

### What `UserScope` offers

| Method                                                                | Does                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `list(table, { where, orderBy, limit, offset })`                      | the person's rows, filtered, ordered, paged                   |
| `find(table, where)` / `findById(table, id)`                          | one row or `null` (also `null` for someone else's id)         |
| `count(table, where?)`                                                | how many rows match                                           |
| `create(table, values, { clientRequestId? })`                         | one row; idempotent when an id is given → `{ row, created }`  |
| `createMany(table, values[])`                                         | several rows (imports, seeding); not idempotent               |
| `update(table, where, patch)` / `updateById(table, id, patch)`        | updates, refreshes `updated_at`; returns rows / row or `null` |
| `remove(table, where)` / `removeById(table, id)` / `removeAll(table)` | deletes; `removeAll` is for data deletion on request          |
| `transaction(async (scope) => …)`                                     | all-or-nothing; use the `scope` it hands you inside           |

Rules for the `where` you pass: build it only from columns of the table you are querying (`eq`, `and`, `or`, `ilike`, `inArray`, …). It is combined with the owner filter using AND, so it can only narrow results. Do not put sub-selects on other tables inside it. Always paginate lists that can grow (`limit`).

### Need a join, an aggregate, something missing?

Add a new method **inside `src/server/db/scoped.ts`**, applying the owner filter through `this.owned(...)` like the others, so it is reviewed in one place. Do not import the raw client, do not disable the lint rules. For joins you can usually run two scoped queries and combine them in the service.

### Background work and scripts (seeding, scheduled jobs, export, delete)

They have no signed-in user, so use `@/server/auth/system-context`:

- `contextForUser(userId)` → a `UserContext` for one existing, allowed person.
- `listUserContexts()` → one `UserContext` per allowed person (jobs that must run for everyone loop over this).

Then `forUser(ctx)` as usual: even background work is confined to one person at a time. Never call these from code that is answering a user's request.

Run a script that touches `src/server` with `npm run script -- scripts/your-script.ts` (this passes `--conditions=react-server`, which `import "server-only"` needs). Scripts must not import `@/server/auth/current-user` (it needs Next.js).

---

## 3. Adding a new user-owned table

1. Create `src/server/db/schema/<area>.ts` (relative imports only; drizzle-kit loads it in plain Node):

   ```ts
   import { boolean, index, text } from "drizzle-orm/pg-core";
   import { userOwnedTable } from "../user-owned-table";

   export const tasks = userOwnedTable(
     "tasks",
     {
       title: text("title").notNull(),
       done: boolean("done").notNull().default(false),
     },
     (t) => [index("tasks_user_done_idx").on(t.userId, t.done)], // optional extra indexes
   );
   ```

   Never use plain `pgTable` for a table that holds a person's data. Do not declare `id`, `userId`, `clientRequestId`, `createdAt`, `updatedAt` yourself (they are added, and declaring them throws). Start every extra index with `t.userId`: almost every query is "this person's rows where …".

2. Export it from `src/server/db/schema/index.ts`: `export * from "./<area>";`
3. `npm run db:generate` → creates a SQL file in `drizzle/`. Read it, then commit it together with the schema.
4. `npm run db:migrate` to apply it locally. (On Vercel it is applied automatically during the build.)
5. Use it only through `forUser(user)`.

Tables that are **not** about one person (shared reference data) do not exist yet. If one is ever needed, raise it with the owner first; it would be a deliberate exception.

---

## 4. Table conventions

Every table made with `userOwnedTable()` has these columns:

| Column (TypeScript / SQL)               | Type                                                         | Meaning                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `id` / `id`                             | uuid, generated by the database                              | primary key                                                                                                   |
| `userId` / `user_id`                    | text, required, foreign key → `user.id`, `ON DELETE CASCADE` | the owner. Deleting a user deletes their rows.                                                                |
| `clientRequestId` / `client_request_id` | text, optional                                               | idempotency key; **unique per user** (index `<table>_user_client_request_uq` on `user_id, client_request_id`) |
| `createdAt` / `created_at`              | timestamptz, default `now()`                                 | set once by the database                                                                                      |
| `updatedAt` / `updated_at`              | timestamptz, default `now()`                                 | refreshed by the data layer on every update                                                                   |

Naming: tables are plural snake_case (`tasks`, `journal_entries`); columns are snake_case in SQL and camelCase in TypeScript. Times are always timestamptz (stored in UTC); how to display them in the person's time zone is a UI matter.

---

## 5. API routes

Every API route handler is wrapped in `userRoute` or `publicRoute` from `@/server/http/route`. They give you the request context and turn every thrown error into the standard error response (section 6).

```ts
// src/app/api/tasks/route.ts
import { z } from "zod";
import { idempotentCreate } from "@/shared/idempotency";
import { createdJson, ok, readJson, userRoute } from "@/server/http/route";
import { tasks } from "@/server/db/schema";

export const GET = userRoute(async ({ scope }) =>
  ok({ tasks: await scope.list(tasks, { limit: 100 }) }),
);

const createTask = z.object({ title: z.string().min(1).max(500), ...idempotentCreate });

export const POST = userRoute(async ({ req, scope }) => {
  const { clientRequestId, ...values } = await readJson(req, createTask);
  const { row, created } = await scope.create(tasks, values, { clientRequestId });
  return created ? createdJson(row) : ok(row); // 201 first time, 200 on a retry
});
```

```ts
// src/app/api/tasks/[id]/route.ts  (dynamic segments arrive already awaited in `params`)
import { notFound } from "@/server/http/errors";
export const GET = userRoute<{ id: string }>(async ({ scope, params }) => {
  const task = await scope.findById(tasks, params.id);
  if (!task) throw notFound(); // also what you get for someone else's id
  return ok(task);
});
```

What the wrappers give you:

- `userRoute(handler)` → `handler({ req, params, traceId, user, scope })`. Requires a valid session whose email is on the allow-list; otherwise the standard `401` / `403` is returned before your code runs. Use this for **all** data routes.
- `publicRoute(handler)` → `handler({ req, params, traceId })`. No sign-in. Only for things like health checks. It must never touch user data.
- Helpers: `ok(data, init?)` (200), `createdJson(data)` (201), `noContent()` (204), `readJson(req, schema)` and `readQuery(req, schema)` (validate with Zod; failures become the standard `400`).
- Responses carry `Cache-Control: private, no-store`.
- Throw to answer with an error: `throw notFound()`, `forbidden()`, `conflict("…")`, `badRequest("…")`, `validationFailed([...])`, `rateLimited()` (all from `@/server/http/errors`).
- Do not catch errors just to log them: unexpected errors are logged for you (safely) and the person gets a generic message.

`src/proxy.ts` additionally answers any `/api/*` request that has **no session cookie at all** with the same standard 401, before it reaches your code (public paths: `/sign-in`, `/api/auth/*`, `/api/health`). It is only a first filter: your route's `userRoute` does the real check.

**Better Auth's own endpoints** (`/api/auth/*`: sign-in, callback, get-session, sign-out) use Better Auth's response format, not the standard one below. Do not build on them beyond the sign-in/out screens; use `requireUser`.

---

## 6. The error response convention

Every error from our own API routes has this exact shape:

```json
{ "error": { "code": "not_found", "message": "We couldn't find that.", "traceId": "9a8c…" } }
```

- **`code`**: a stable machine string. Clients branch on it. **Never rename or remove one.** New codes may be added to `src/shared/errors.ts` (only the Foundation owner changes that file; ask via your handoff).
- **`message`**: human-friendly, calm, blame-free, safe to show as is. Never contains SQL, stack traces, ids of other people's data or raw library text. Never guilt-inducing wording.
- **`details`** (only for `validation_failed`): `[{ "field": "title", "message": "…" }]`, the fields to fix.
- **`traceId`**: matches the line in the server log, so a problem can be traced without exposing anything.

| `code`              | HTTP | Use when                                                                                                                |
| ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `unauthenticated`   | 401  | no valid session                                                                                                        |
| `forbidden`         | 403  | signed in but not allowed (for example the email was removed from the allow-list)                                       |
| `not_found`         | 404  | the thing does not exist **or belongs to someone else** (never reveal which; the scoped layer already behaves this way) |
| `validation_failed` | 400  | well-formed request with a missing or wrong field (`details` lists them)                                                |
| `bad_request`       | 400  | request cannot be understood (for example malformed JSON)                                                               |
| `conflict`          | 409  | clashes with current data                                                                                               |
| `rate_limited`      | 429  | too many requests                                                                                                       |
| `internal_error`    | 500  | our fault; details are only in the server log                                                                           |

Convention for other agents' routes: use `forbidden` only for "allowed to exist but not allowed to do this" and `not_found` for anything cross-user. Use `validation_failed` for every Zod failure (the helpers do this automatically).

Types for clients: `ApiErrorBody`, `ErrorCode`, `ValidationIssue` from `@/shared/errors`.

---

## 7. Idempotent creates

Anything the user can accidentally create twice (a retry after a bad connection, the offline queue replaying) is created with a **client-supplied request id**.

- The client generates a fresh `crypto.randomUUID()` **per user action** and sends it as `clientRequestId` in the JSON body. The **same** value is reused for every retry of that action.
- The server passes it to `scope.create(table, values, { clientRequestId })` (the request schema includes `...idempotentCreate` from `@/shared/idempotency`: 8–100 characters of `A–Z a–z 0–9 _ -`, optional).
- First time the id is seen for that person: the row is created → **HTTP 201** with the row.
- Seen before for that person: the existing row is returned unchanged → **HTTP 200**, nothing duplicated, no error, even if the retry's other fields differ.
- The id is scoped per person (two people can never collide) and concurrent retries are safe (a database unique index decides).
- Requests without an id are simply not idempotent (and are created normally).

Use this for every endpoint that creates a row from user input.

---

## 8. Sign-in, sessions and pages

- **Google only.** Better Auth with Google. No passwords, no email links. Sessions are database-backed, HTTP-only cookies named `flowzone.session_token` (30 days, sliding). Cookies are HTTPS-only whenever the app is served over HTTPS.
- **Closed sign-up.** Only emails listed in `ALLOWED_EMAILS` can get an account or a session. Anyone else is sent back to `/sign-in?error=not_allowed` with a friendly message and **no account is created**. The check runs when an account is created, when a session is created, and on every request (`isEmailAllowed` in `src/server/auth/allow-list.ts`), so removing an email from the list locks that person out immediately.
- **Pages** (Server Components): `const user = await requirePageUser();` (redirects to `/sign-in` when signed out). To branch without redirecting use `getPageSession()`. With Cache Components on, reading the session uses request headers, so it must run inside a `<Suspense>` boundary (see `src/app/page.tsx`).
- **API routes**: `userRoute` (section 5). Do not call Better Auth yourself.
- **Browser**: `authClient` from `@/ui/auth-client` (sign-in button, sign-out).
- Placeholder screens (`/sign-in`, `/`) are Foundation's; Frontend Core replaces their look and keeps their behaviour (sign-in button calls `authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/sign-in" })`; the page shows the friendly message for the error codes in `NOT_ALLOWED_ERROR_CODES`).
- `GET /api/health` is public and returns `{ status, checks: { app, database } }` (200 healthy, 503 when the database cannot be reached).

---

## 9. Test-only login

For automated tests (Playwright). It signs in as a **named test user** without Google.

```
POST /api/auth/test-login
Content-Type: application/json
Origin: <the app's own address>            (see note below)

{ "user": "alice" }                         name: lowercase letters, digits, dashes; max 32 characters
→ 200 { "user": { "id": "…", "email": "alice@test.flowzone.invalid", "name": "Test alice" } }
  and the normal session cookie is set.
```

- Each name is a separate, persistent user with isolated data (`alice` and `bob` are enough for isolation tests). The user is created on first use. Test users live on the reserved `test.flowzone.invalid` domain, so they can never be a real person.
- **Turning it on** (local machine or a test environment only): put `ENABLE_TEST_LOGIN=true` in the environment. If you run a **production build** locally (`npm run build && npm start`), also set `APP_ENV=test` (or `development`), because those commands run as production and production refuses test login. In `.env.local`, `APP_ENV=development` is already enough for normal local work.
- **Playwright**: call the endpoint through the browser context's request object so the cookie lands in the browser: `await context.request.post("/api/auth/test-login", { data: { user: "alice" }, headers: { Origin: baseURL } })`, then `page.goto("/")`. For two users use two browser contexts.
- The `Origin` header is required when the request already carries cookies (Better Auth's cross-site protection); sending it always is simplest.
- When it is off (or in production) the endpoint does not exist: `404`.
- **It is impossible to enable in production. Three independent guards:** (1) at startup the app refuses to run if `ENABLE_TEST_LOGIN=true` is set in a production environment (every request fails with a clear log message); (2) the endpoint is only registered when that startup check allows it; (3) on every request the endpoint re-reads the raw environment and answers `404` unless the flag is on **and** the deployment is not production. "Production" is: Vercel production (cannot be overridden by anything), or `APP_ENV=production`, or `NODE_ENV=production` when `APP_ENV` is not set. An unrecognised `APP_ENV` counts as production.
- **Never set `ENABLE_TEST_LOGIN` in Vercel, including Preview** (preview URLs are public). Tests run against a local server.
- Test users and their data are real rows in whichever database the app is pointed at: use a development database, never production. Clean up by deleting the users (their rows cascade).

---

## 10. Environment variables

- **One place reads settings:** `src/server/env.ts` (validated with Zod when the server starts; `src/instrumentation.ts` loads it at boot). Import `env` from `@/server/env`. Do not read `process.env` elsewhere in application code.
- **A missing or malformed variable stops the app at startup** with a list of what is wrong (names only, never values).
- **To add a variable:** add it to the Zod `schema` and to the `Env` object in `src/server/env.ts`, and add it to `.env.example` with a plain-language comment and **no value**. Everyone who adds a variable does both.
- `.env.example` is the only env file that may be committed (everything else matching `.env*` is git-ignored). Real values live in `.env.local` (your machine) and the Vercel dashboard. Never in the repository, a handoff note, an issue or a chat.
- Variables the browser must see start with `NEXT_PUBLIC_` and must never be secrets. There are none today.
- Blank values (`FOO=`) count as "not set".
- `next build` loads the environment too, so building needs the variables (Vercel has them). Build-time and run-time checks use the same module.

Current variables: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `ENABLE_TEST_LOGIN`, `APP_ENV` (see `.env.example` for what each means). Vercel supplies `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` itself.

---

## 11. Database and migrations

- Postgres via Drizzle ORM. Schema in `src/server/db/schema/`, SQL migrations in `drizzle/` (committed; never edit an applied migration, add a new one).
- `npm run db:generate` creates a migration from schema changes; `npm run db:migrate` applies pending ones (safe to repeat; takes a database lock so two deployments cannot migrate at once).
- On Vercel, `npm run vercel-build` (which Vercel uses instead of `build`) runs the migrations **before** `next build`; a failing migration fails the deployment, so broken schema never goes live. Preview deployments migrate their own database branch.
- Because the previous version keeps serving until the new one is promoted, write migrations that are backwards compatible with the code that is currently live (add before you remove).
- `DATABASE_URL` is the **pooled** connection used at runtime; `DATABASE_URL_UNPOOLED` is the direct one used by migrations. Do not use session-level Postgres features (advisory locks, LISTEN/NOTIFY, `SET` without `LOCAL`) through the app's pooled connection.
- Auth tables (`user`, `session`, `account`, `verification`) belong to Foundation and Better Auth.

---

## 12. Logging and privacy

- Use `logError`, `logWarn`, `logInfo` from `@/server/log`. They print one JSON line.
- **Never log personal content**: task text, notes, journal entries, chat messages, names, emails, request or response bodies, or `error.message` from a library (database errors can quote values). Log an event name, the route, the `traceId`, and for errors only the type, a machine code (for example a Postgres SQLSTATE) and stack frames; `logError` already does exactly that.
- No third-party analytics, tracking or error-reporting services.

---

## 13. Next.js notes

- Next.js 16 with **Cache Components on** (the framework default for new projects, and the only mode in the next major version). Anything that reads request data (cookies, headers, `searchParams`, the session) must be inside a `<Suspense>` boundary or it fails the build with a clear message. Do not use `export const dynamic`/`revalidate` route segment config (not allowed with Cache Components). Read `node_modules/next/dist/docs/` for the exact rules of this version before writing routing code (see `AGENTS.md`).
- `src/proxy.ts` is the Next.js 16 name for middleware.
- Security headers are set in `next.config.ts` (HSTS, nosniff, no framing, referrer policy, permissions policy and a baseline CSP). A strict script policy with nonces is deliberately deferred until the client features exist; add it together with the PWA work, not before.
- Checks that must stay green: `npm run lint`, `npm run typecheck`, `npm run format:check` (all three: `npm run check`), and `npm run build`.
