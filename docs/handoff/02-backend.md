# Handoff 02: Backend

Status: **built and verified locally** (type check, lint, format check and production build pass; the API was driven end to end against a local Postgres 17). **Not yet run on Neon or Vercel**, which waits on the owner's Foundation steps 4–8. Nothing is committed or pushed.

Next readers:

- **Frontend Core:** start with [`docs/contracts/api.md`](../contracts/api.md). Read sections 1 (conventions), 4 (endpoints) and 5 (example flows) first.
- **AI and Nudges:** start with the service layer (`api.md` section 6) and the lifecycle registry (section 7). Your consent and data rules are in sections 3.7 and 8.

Contents: [1 What was built](#1-what-was-built) · [2 Run it and seed it](#2-run-it-and-seed-it) · [3 Tuning constants](#3-tuning-constants) · [4 Defaults for owner review](#4-defaults-for-owner-review) · [5 Deviations](#5-deviations) · [6 Blockers raised to Foundation](#6-blockers-raised-to-foundation) · [7 Registering a lifecycle handler](#7-registering-a-lifecycle-handler) · [8 Verification record](#8-verification-record) · [9 Known limitations](#9-known-limitations) · [10 Acceptance checklist](#10-acceptance-checklist)

---

## 1. What was built

**Database** (migration `drizzle/0001_good_sleeper.sql`, applied to a clean database):

- `projects`, `tasks` (with subtasks, recurrence rule, energy, estimate, snooze, drop), `recurrence_records`, `entries`, `day_plans`, `day_plan_items`, `user_settings` (time zone, quiet hours, first-run flag, the four consent switches with change times).
- Every table is user-owned (`userOwnedTable`), so all access goes through `forUser()`.

**Domain service layer** (`src/services/`). All rules live here, so the API, the AI tools and the Nudges engine behave the same:

- `rules/recurrence.ts`: current occurrence, silent skips, the consecutive-skip count and flag (pure).
- `rules/attention.ts`: suggestions, fresh-look reasons, stale check (pure).
- `rules/quick-add.ts`: the deterministic parser (pure).
- `tasks.ts`, `projects.ts`, `entries.ts`, `today.ts`, `search.ts`, `settings.ts`: the operations.
- `lifecycle/`: the registry, the core handler, the ZIP writer, and the export and delete runner.

**REST API** (`src/app/api/`): 24 route files. Full list in `api.md` section 4.

**Shared code** (`src/shared/`, usable by the browser): response types (`views.ts`), request schemas (`api-schemas.ts`), tuning (`tuning.ts`), calendar helpers (`calendar.ts`), recurrence types (`recurrence.ts`), consent names (`consent.ts`).

**Server helpers**: `src/server/http/params.ts` (path ids and dates, optional JSON bodies), `src/server/auth/account.ts` (sign-out and the account row, the only place those raw calls are allowed).

**Scripts**: `scripts/seed.ts` (development only).

**Contract**: `docs/contracts/api.md`.

**Not added**: no new environment variables. No new dependencies.

## 2. Run it and seed it

Prerequisites: a development database in `DATABASE_URL` (see Foundation). Nothing else is new.

```
npm run db:migrate                         # applies 0001 (and any later migration)
npm run script -- scripts/seed.ts          # sample data for the first two ALLOWED_EMAILS
npm run dev                                # or: npm run build && npm start
```

**The seed script**

- Refuses to run unless `APP_ENV` is `development` or `test`, and refuses on Vercel. It stops with a clear message before writing anything.
- Uses the first two entries of `ALLOWED_EMAILS`. It creates their sign-in records if missing (a later Google sign-in links to the same record).
- **Replaces their core data** (tasks, projects, notes, plans, settings). No other person's data is touched. Run it again to get back to the sample set.
- Sample set: a few Inbox tasks; a Work project with a high-priority in-progress task due today, a task due tomorrow at 10:00, and a weekly check-in on Monday and Wednesday; a Home project with a task due three days ago (fresh-look), a task untouched for 12 days (fresh-look and resurfacing), an every-2-days task, and a daily habit untouched for six days (the skip flag is on); a task broken into three steps; a completed task; a note linked to a task; two journal entries; a plan for today that is not yet confirmed.

For the owner's first run against Neon: point `.env.local` at the **dev** branch first, then seed. Never seed the production branch.

**On Vercel**: `vercel-build` applies migrations before the build (Foundation). Migration 0001 is additive (new tables only), so it is safe to deploy.

## 3. Tuning constants

**Where:** `src/shared/tuning.ts`. Change values there and nowhere else. The full table with meanings is in `api.md` section 9.

| Constant                            | Default           |
| ----------------------------------- | ----------------- |
| `TODAY_SUGGESTION_SIZE`             | 5                 |
| `TODAY_PLAN_MAX_ITEMS`              | 10                |
| `STALE_THRESHOLD_DAYS`              | 7                 |
| `CONSECUTIVE_SKIPS_THRESHOLD`       | 3                 |
| `CONSECUTIVE_SKIPS_LOOKBACK`        | 60                |
| `DUE_SOON_DAYS`                     | 2                 |
| `SNOOZE_DEFAULT_DAYS`               | 3                 |
| `CANDIDATE_POOL_LIMIT`              | 300               |
| `DEFAULT_TIME_ZONE`                 | `UTC`             |
| `DEFAULT_QUIET_HOURS_START` / `END` | `21:00` / `08:00` |

## 4. Defaults for owner review

I chose these where the brief left room. Each one is a single change if you prefer otherwise. Please confirm or redirect.

**Decision needed**

1. **Does a dated task stay in the Inbox?** I made the Inbox "open top-level tasks with no project", whatever their date. The brief's line "unless a date or project is given" could also mean dated tasks should leave the Inbox. Today and fresh-look show dated tasks either way. Changing this is a small query change in `listTasks`.

**Tasks** 2. **Priority:** `low`, `normal` (default), `high`. 3. **Energy filter:** a task needing more energy than the chosen level is hidden; a task with no energy is always shown. 4. **Subtasks:** one level only. A subtask has no project and no repeat, but may have a date, time, energy and estimate. A break-down counts as activity on the parent; creating a subtask directly does not. 5. **Drop vs delete:** `drop` hides the task and its subtasks permanently (they stay in the export). I did not add an undo. `DELETE` removes the task and its history for good.

**Recurrence** 6. **Acting on an occurrence needs the date.** `complete` and `skip` on a repeating task require `occurrenceDate` (the date the person saw). Without it, a repeated request would act on the next occurrence. The frontend must send it. 7. **Rule details:** every 2 to 365 days (every 1 day is "daily"); monthly on day 31 lands on the last day of shorter months; a repeating task's start date defaults to its date or today. 8. **Consecutive skips** count both silent passes and explicit skips, look back at most 60 occurrences, and the flag turns on at 3.

**Attention** 9. **Stale** means no change to the task itself for 7 days. Snoozing and entries linked to the task are not activity. 10. **"Due today" includes past dates** in Today's reasons. It is an internal label, never shown as a failure. 11. **Snooze:** default 3 days, at most a year, must be after today. 12. **Suggestions do not exclude planned tasks.** The plan is a separate list.

**Today and the plan** 13. A plan holds up to 10 tasks; suggestions are 5. Plan confirmation is a flag, not a lock: editing after confirming keeps the flag.

**Quick-add** 14. Numeric dates (`11/12`) are not recognised. A short weekday (`sun`) needs a connector before it (`on sun`). A time with no date means today. An unknown project name returns `projectId: null` (the interface can create the project).

**Search** 15. Full-text with the `simple` configuration (no stemming, so it works for any language), prefix matching on every word, all words required.

**Settings and consent** 16. Time zone defaults to `UTC` until the first run sets it. The browser's zone is sent by the frontend (`api.md` 4.9). There is no automatic detection on the server. 17. Each switch stores the time of its last change only, not a history. A full history would need a table; say if you want one.

**Entries** 18. A journal entry is an entry with `kind: journal`. An end-of-day reflection is a journal entry dated that day; there is no separate type.

**Account** 19. Deletion requires the exact text `DELETE`. It is immediate and irreversible (no grace period). The session is ended first, so the response clears the cookies. 20. Export is one ZIP, stored without compression, with JSON and readable Markdown. It includes the account email and name, and dropped tasks.

**Pagination:** offset-based (`limit`, `offset`, `hasMore`), not cursor-based. Fine for personal volumes; say if you want cursors.

## 5. Deviations

- **Contract written alongside, then checked.** The brief asks for the contract before the code. I built the code and wrote `api.md` in the same session, then checked every endpoint, field and rule against the code and against the runtime results. Section 10 of this note records that check.
- **Typing workaround.** The scoped layer's `NewRow` type drops optional columns (blocker B1 below). I did not change Foundation's file. Services write values with `satisfies InsertOf<…>` and `patchFor<…>(…)` from `src/services/db-types.ts`. Once B1 is fixed, these helpers can be removed.
- **Service errors** are `ApiError` objects (the Foundation error class). Callers outside HTTP (AI tools, Nudges) should catch them and read `code` and `message`. I did not invent a second error type.
- **Migration file name** `0001_good_sleeper.sql` is drizzle-kit's generated name. Left as generated.
- **`ESLint` and format:** new code passes with no warnings. Foundation's rules were not relaxed.

## 6. Blockers raised to Foundation

Foundation files were **not** changed.

**B1. The scoped layer's `NewRow<T>` drops every optional column** (`src/server/db/scoped.ts`).

- Evidence: `NewRow<typeof projects>` has no key `position` (it has a default). The same applies to every nullable column and every column with a default, so `scope.create` and `scope.update` reject them as unknown properties under type checking. `RowPatch` is built from `NewRow`, so it has the same gap.
- Cause (as far as I can tell): `Omit<InferInsertModel<T>, Reserved>` on the generic `T`.
- **Proposed fix (tested to compile):** `type NewRow<T extends { $inferInsert: object }> = Omit<T["$inferInsert"], Reserved>;` with `RowPatch` unchanged. A probe confirmed both required and optional keys are accepted.
- Impact until fixed: none at runtime. Only type-level. Workaround in `src/services/db-types.ts`.
- Decision for the Foundation owner: approve the fix, and I can remove the workaround (or the Foundation agent makes the change).

## 7. Registering a lifecycle handler

Full contract: `api.md` section 7. The steps, for the AI and Nudges agents:

1. Create a module (for example `src/services/ai/lifecycle.ts`) that exports a `LifecycleHandler`: a unique `id`, a `title`, `exportFiles(ctx)` returning `{ path, content }` text files (JSON, and readable text where useful), and `deleteData(ctx)` that removes everything the person has in your tables and in any external store.
2. Use `ctx.scope` for your tables (already scoped to the person), and `ctx.user` for the account.
3. In `src/services/lifecycle/registry.ts`, import your handler and add it to `LIFECYCLE_HANDLERS` (order = deletion order; core stays first).
4. Check: run `GET /api/account/export` and open the ZIP; run `POST /api/account/delete` on a development account and check your rows are gone.

Your tables must be `userOwnedTable()` tables with `user_id` cascade (Foundation). Rows are removed by the cascade as well, so a handler that forgets a row still leaves nothing behind, but external stores (push subscriptions) need the handler.

## 8. Verification record

Everything below was run on this machine against a **throwaway Postgres 17 container** on port 54329 (the port in `.env.local`), and a **production build** (`npm run build`, `npm start`). Test accounts `alice` and `bob` were used, with `ALLOWED_EMAILS` overridden for that server process only (no file changed). Nothing was committed.

**Gates**

| Gate                                          | Result                                |
| --------------------------------------------- | ------------------------------------- |
| `npm run typecheck` (`tsc --noEmit`)          | pass, no errors                       |
| `npm run lint`                                | pass, no warnings                     |
| `npx prettier --check` on the changed folders | pass                                  |
| `npm run build`                               | pass; all 24 API route files compiled |
| `npm run db:migrate` on the clean database    | applied; the 11 tables exist          |

**End-to-end HTTP checks** (a scripted run of the live server, outside the repo): **138 of 138 pass**.
They cover, per resource: create, read, update, delete; idempotent retries (same `clientRequestId` gives the same row with `200`); validation errors with field names; malformed JSON; unknown fields; the Inbox; projects; subtasks and the one-level rule; completion and skip; reopening; the drop cascade; reschedule; snooze; the plan (order, confirm, reorder, duplicates, others' tasks); suggestions (count, reasons, energy filter); fresh-look and resurfacing; entries (kinds, filters, links, patch); search (title, word prefix, empty query, other person's data); quick-add examples; settings (defaults, time zone, quiet hours, bad time zone); consent (defaults off, change time recorded, same value keeps its time, independent switches, unknown switch refused); **cross-user isolation** (bob gets `404` on every one of alice's tasks, cannot list, change, complete, delete, link entries to, or plan with them, and cannot read her project); export; deletion without confirmation refused; deletion of bob's account, and his old session refused afterwards; no guilt words in responses.

**The recurrence scenario the brief asked for** (a repeating task missed several times):

- A daily task started six days ago, never completed: `consecutiveSkips` is 6, `adjustSuggested` is true, current occurrence is today. Nothing was stored for the six days.
- Completing today moves the current occurrence to tomorrow and resets the count to 0 and the flag to off.
- A daily task started two days ago: count 2, flag off. One explicit skip today: count 3, flag on, current occurrence tomorrow.
- A second "complete" for the same day is harmless (returns the same state, does not complete tomorrow).
- Pausing: no current occurrence and no flag; acting on it is refused (`409`); resuming restores it.
- Rule checks: weekly on Monday and Wednesday, every 3 days, monthly on day 31, and a non-occurrence date is refused (`400`).

**Fresh look and stale path** (activity time set in the database, then read through the API): a task untouched for 10 days appears in resurfacing and in fresh-look with reason `stale`, and in suggestions with reason `resurfacing`. Snoozing removes it from both. Editing it clears staleness.

**Pure rule checks** (run directly against the rule modules): 35 of 36 pass. The one that "failed" was my expectation, not the code: the next occurrence on or after 29 February 2028 for a monthly-on-31 rule is 29 February itself, which is what the code returns. Other cases checked: month-end clamping, weekly wrap-around, every-N boundaries, the 60-occurrence cap, pause and future start, and these quick-add cases: `Call Sam tomorrow at 5pm #Work !high`; `Gym 12:30am` (00:30); `Lunch 12pm` (12:00); `ship next friday` and `ship friday` (both 20 Nov from a Saturday); `Sun cream` stays a title; `Pick up parcel on sun` (15 Nov); `Trip May 5` (next year once passed); `Check in 3 days`; `!!` and `!low`.

**Export:** the ZIP opens with the .NET archive reader; every listed file is present; `readable/tasks.md` shows the Inbox, projects, recurrence, skip counts, snoozes and the dropped section as intended.

**Deletion:** for one person, row counts before and after deletion: projects, tasks, recurrence records, entries, plans, plan items, settings, sessions (3) and the account record all went from non-zero to **0**. Cookies were cleared (empty values, as Better Auth does).

**Seed:** runs cleanly against the local database. Refused with `VERCEL=1` and with `APP_ENV=production`, each with a clear message and no writes.

**Not verified here:** Neon, Vercel, and real Google sign-in with the owner's accounts (Foundation's step 8). Only UTC and Europe/Paris were tested as time zones.

## 9. Known limitations

- **Only verified locally** (see section 8). Re-run the gates and the seed on the Neon dev branch once it exists.
- **The candidate pool is 300 open tasks**, least recently touched first. With more than 300 open tasks, the newest-touched ones are not considered for suggestions until older ones change. Fine for personal volumes.
- **Consecutive-skip count is capped at 60** occurrences (about two months for a daily task).
- **Search is word-prefix only**: no typo tolerance and no synonyms. It matches the text stored on each task or entry, and does not look across linked items.
- **Subtasks cannot repeat**, and a repeating task cannot take its own date. Both are deliberate (see `api.md` 3.2 and 3.3).
- **The export is in memory**, uncompressed. Fine for a personal account; a very large account would need streaming.
- **No rate limiting** on the new endpoints. The brief did not ask for it.
- **The fresh-look reason values** (`date_passed`, `stale`) are stable codes. The wording shown to people is the frontend's job, and must stay calm.
- **Time-based checks ran against the real clock** of the machine on the day of testing. The rules are date arithmetic only, so they do not depend on the clock except through "today" and "now", which are passed in.

## 10. Acceptance checklist

| #   | Deliverable (brief section 7)                                                                                                                       | Status                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | `docs/contracts/api.md` complete and consistent with the code; no overdue semantics                                                                 | Done. Checked against the code and the runtime results. Contains no guilt-implying words. |
| 2   | Core schema and migrations apply cleanly to an empty database; all user-owned tables use the owner column                                           | Done. Applied to an empty database; every table is `userOwnedTable`.                      |
| 3   | Core REST API and service layer; per-resource create, read, update, delete, idempotent retry, validation, user A cannot see or change user B's data | Done. Section 8.                                                                          |
| 4   | Recurrence, Today suggestion, fresh-look, resurfacing, quick-add, search; scenarios documented; parser examples                                     | Done. Section 8 (scenarios and examples).                                                 |
| 5   | Settings and consent, all four switches default off                                                                                                 | Done and verified.                                                                        |
| 6   | Export and deletion with the registry; export readable; deletion removes everything and signs out; registry documented                              | Done and verified. Section 8 and `api.md` 7.                                              |
| 7   | Seed script and this handoff note                                                                                                                   | Done.                                                                                     |
| —   | Definition of done: build, type check and lint pass; acceptance verified; contract and code agree; no TODOs                                         | Done, with the Neon and Vercel caveat in section 8. No TODO comments in the new code.     |

**Questions for the owner:** section 4, item 1 (Inbox and dated tasks) and item 17 (consent history). **Blocker for the Foundation owner:** section 6 (B1). **Owner steps:** nothing new beyond Foundation's steps; the migration runs on the next deploy. When you are happy with this work, say so and I will commit it (not pushed, unless you approve a push).
