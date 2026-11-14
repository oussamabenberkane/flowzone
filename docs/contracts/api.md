# Core API contract

Owner: the Backend agent (Agent 2). **Read-only for everyone else.** Other agents may read this document and must not change it. If something here blocks you, write the problem in your handoff note.

This is the contract for the core REST API, the service layer, the core database schema, the consent switches, the data lifecycle registry, the tuning constants and the quick-add parser. It is written to match the implementation. Where the two disagree, that is a bug to report.

Read first: [`foundation.md`](foundation.md). It defines user scoping, the error shape, idempotent creates, table conventions and environment variables. Everything here relies on it and does not repeat it in full.

Contents: [1 Conventions](#1-conventions) · [2 Resources and fields](#2-resources-and-fields) · [3 Rules](#3-rules) · [4 Endpoints](#4-endpoints) · [5 Example flows](#5-example-flows) · [6 Service layer](#6-service-layer) · [7 Data lifecycle registry](#7-data-lifecycle-registry) · [8 Consent switches](#8-consent-switches) · [9 Tuning constants](#9-tuning-constants) · [10 Database schema](#10-database-schema) · [11 Quick-add grammar](#11-quick-add-grammar)

---

## 1. Conventions

### 1.1 Base and format

- Base path: `/api`. JSON in, JSON out (`application/json`), except the export download.
- Every endpoint requires a signed-in, allowed person. Without a session the response is `401 unauthenticated`. Only `/api/health` and `/api/auth/*` are public (Foundation).
- All text the API returns is English.
- Every response carries `Cache-Control: private, no-store`.

### 1.2 Errors

Every error uses the Foundation shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "A few details need another look.",
    "details": [{ "field": "title", "message": "Give the task a short title." }],
    "traceId": "…"
  }
}
```

Codes used by this API:

| Code                | HTTP | When                                                                                        |
| ------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `unauthenticated`   | 401  | no session                                                                                  |
| `forbidden`         | 403  | signed in, but the email is no longer allowed                                               |
| `not_found`         | 404  | the item does not exist, belongs to someone else, is dropped, or the id is not a valid UUID |
| `validation_failed` | 400  | a field is missing or wrong; `details` lists each field                                     |
| `bad_request`       | 400  | the body is not JSON                                                                        |
| `conflict`          | 409  | the request clashes with a rule (for example completing a paused repeating task)            |
| `internal_error`    | 500  | our fault; details only in the server log                                                   |

`details[].field` is a dotted path, for example `steps.0.title`. A field may be named in `details` even when the rule is about a combination of fields (for example `dueTime` when there is no date).

### 1.3 Strict bodies

Every request body is strict: an unknown field is a `validation_failed` error. A typo never silently does nothing.

### 1.4 Missing, null and empty

- A field that is **left out** of a PATCH is unchanged.
- A field set to **`null`** is cleared.
- Action endpoints (`complete`, `skip`, `snooze`, `drop`, `breakdown`) read an empty body as `{}`.

### 1.5 Identifiers

Ids are UUIDs created by the database. A malformed id in the path is `404 not_found`, the same as an unknown id.

### 1.6 Idempotent creates

Creates that a person could accidentally repeat accept `clientRequestId` (Foundation section 7). The same id returns the original row with **200**; the first creation returns **201**. Endpoints that accept it:

- `POST /api/projects`, `POST /api/tasks`, `POST /api/entries`
- steps of `POST /api/tasks/:id/breakdown` (each step may carry its own id)

Other actions are idempotent by their nature:

- `PUT /api/plans/:date` replaces the plan, so repeating it gives the same result.
- `complete` and `skip` on a repeating task name the occurrence (see 3.3). Repeating the call leaves the record as it was.
- `complete` on a one-off task that is already completed returns it unchanged.
- `drop` on a dropped task returns `204`. Once the task has been deleted, it returns `404`.

### 1.7 Pagination

- Offset pagination: `limit` (default and maximum below) and `offset` (default 0).
- Paged responses include `hasMore`. The page is never longer than `limit`.

| Endpoint                                               | Default `limit` | Maximum |
| ------------------------------------------------------ | --------------- | ------- |
| `GET /api/tasks`, `GET /api/inbox`, `GET /api/entries` | 50              | 200     |
| `GET /api/fresh-look`                                  | 20              | 200     |
| `GET /api/resurfacing`                                 | 3               | 20      |
| `GET /api/search`                                      | 20              | 50      |

### 1.8 Sorting

- Tasks: manual order (`position`, lowest first), then creation time.
- Projects: manual order (`position`), then name.
- Entries: entry date (newest first), then creation time (newest first).
- Suggestions: see 3.4.
- Fresh-look: see 3.5.
- Resurfacing: longest without activity first.
- Search: relevance.

### 1.9 Time and dates

- **Dates** are calendar dates, `YYYY-MM-DD`, in the person's time zone. Impossible dates such as `2026-02-30` are rejected.
- **Times of day** are `HH:MM`, 24-hour.
- **Timestamps** (`createdAt`, `updatedAt`, `completedAt`, `lastActivityAt`, `confirmedAt`, `changedAt`) are ISO 8601 in UTC, for example `2026-11-14T09:30:00.000Z`.
- **"Today"** is computed on the server, from the person's time zone (`settings.timeZone`) at the moment of the request. The client never decides what today is. The default time zone is `UTC` until the first-run flow sets it (see 4.9).
- A **due time** only makes sense with a date (or with a repeating rule). Setting a time without a date is `validation_failed` on `dueTime`.

### 1.10 Wording

Nothing in this API uses guilt-implying words, and no field measures how far behind a person is. A fresh-look result gives a neutral reason (`date_passed` or `stale`). A repeating task that has passed occurrences without completion has a count of consecutive passed occurrences and a flag (see 3.3), and nothing else.

---

## 2. Resources and fields

Shapes are the TypeScript types in `src/shared/views.ts`. Request schemas are in `src/shared/api-schemas.ts`.

### 2.1 Project

| Field                    | Type                  | Meaning      |
| ------------------------ | --------------------- | ------------ |
| `id`                     | uuid                  |              |
| `name`                   | text, 1–80 characters |              |
| `position`               | integer               | manual order |
| `createdAt`, `updatedAt` | timestamp             |              |

Projects are flat. There is no nesting.

### 2.2 Task (`TaskView`)

| Field                    | Type                                    | Meaning                                                  |
| ------------------------ | --------------------------------------- | -------------------------------------------------------- |
| `id`                     | uuid                                    |                                                          |
| `title`                  | text, 1–500 characters                  |                                                          |
| `status`                 | `pending` · `in_progress` · `completed` |                                                          |
| `projectId`              | uuid or null                            | null means the task is in the Inbox                      |
| `parentTaskId`           | uuid or null                            | set for a subtask                                        |
| `dueDate`                | `YYYY-MM-DD` or null                    | for a repeating task, this is its **current occurrence** |
| `dueTime`                | `HH:MM` or null                         | the time of day, with the date                           |
| `priority`               | `low` · `normal` · `high`               | default `normal`                                         |
| `energy`                 | `low` · `medium` · `high` or null       | the energy the task needs                                |
| `estimateMinutes`        | integer 1–1440 or null                  |                                                          |
| `recurrence`             | object or null                          | see 2.3                                                  |
| `position`               | integer                                 | manual order among siblings                              |
| `completedAt`            | timestamp or null                       |                                                          |
| `lastActivityAt`         | timestamp                               | updated by every change a person makes (see 3.5)         |
| `snoozedUntil`           | `YYYY-MM-DD` or null                    | hidden from suggestions and fresh-look until a later day |
| `createdAt`, `updatedAt` | timestamp                               |                                                          |

A **task detail** (`TaskDetailView`, returned by `GET /api/tasks/:id` and `POST …/breakdown`) is the same, plus `subtasks`: a list of `TaskView`, in order.

A **dropped** task is never returned. It is kept only in the export.

### 2.3 Recurrence (`RecurrenceView`)

| Field               | Type                    | Meaning                                                                                                 |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `rule`              | rule object (see below) |                                                                                                         |
| `startDate`         | `YYYY-MM-DD`            | the first day the rule applies from                                                                     |
| `paused`            | boolean                 | a paused task has no current occurrence                                                                 |
| `currentOccurrence` | `YYYY-MM-DD` or null    | null while paused                                                                                       |
| `consecutiveSkips`  | integer 0–60            | occurrences passed without completion in a row, counted back from the current one. Capped at 60 (see 9) |
| `adjustSuggested`   | boolean                 | true when `consecutiveSkips` reached 3. Offer to adjust or pause                                        |

Rule objects:

```json
{ "type": "daily" }
{ "type": "every_n_days", "interval": 3 }     // 2 to 365; every 1 day is "daily"
{ "type": "weekly", "days": [1, 3] }          // 0 = Sunday … 6 = Saturday; 1 to 7 distinct days
{ "type": "monthly", "day": 31 }              // 1 to 31; in a shorter month, the last day of that month
```

### 2.4 Entry (`EntryView`)

| Field                    | Type                         | Meaning                                 |
| ------------------------ | ---------------------------- | --------------------------------------- |
| `id`                     | uuid                         |                                         |
| `kind`                   | `note` · `journal`           | notes and journal are one concept       |
| `title`                  | text up to 200 or null       |                                         |
| `body`                   | text up to 20 000 characters | may be empty only when there is a title |
| `entryDate`              | `YYYY-MM-DD`                 | the calendar day the entry belongs to   |
| `taskId`                 | uuid or null                 | the linked task, if any                 |
| `projectId`              | uuid or null                 | the linked project, if any              |
| `createdAt`, `updatedAt` | timestamp                    |                                         |

An entry needs a title or some text. An end-of-day reflection is a `journal` entry with that day's `entryDate`.

### 2.5 Day plan (`DayPlanView`)

| Field         | Type               | Meaning                                             |
| ------------- | ------------------ | --------------------------------------------------- |
| `date`        | `YYYY-MM-DD`       |                                                     |
| `confirmed`   | boolean            | the person has confirmed the plan                   |
| `confirmedAt` | timestamp or null  |                                                     |
| `tasks`       | list of `TaskView` | in order; tasks that have been dropped are left out |

A plan holds up to 10 tasks, each at most once.

### 2.6 Today (`TodayView`) and suggestions (`SuggestionsView`)

`TodayView`: `date` (today in the person's time zone), `timeZone`, and `plan` (the `DayPlanView` for today).

`SuggestionsView`: `date` and `suggestions`, a list of up to 5 items. Each item is `{ "task": TaskView, "reasons": [...] }`. Reasons are one or more of `due_today`, `due_soon`, `in_progress`, `high_priority`, `resurfacing` (see 3.4).

### 2.7 Fresh look and resurfacing

- `GET /api/fresh-look` returns `{ "items": [{ "task": TaskView, "reason": "date_passed" | "stale" }] }`.
- `GET /api/resurfacing` returns `{ "tasks": [TaskView] }`.

### 2.8 Quick-add result (`QuickAddView`)

| Field         | Type                              | Meaning                                                                                                               |
| ------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `title`       | text                              | what is left after the markers are removed                                                                            |
| `dueDate`     | `YYYY-MM-DD` or null              |                                                                                                                       |
| `dueTime`     | `HH:MM` or null                   |                                                                                                                       |
| `projectName` | text or null                      | the name as written                                                                                                   |
| `projectId`   | uuid or null                      | the person's project with that name (case-insensitive), or null                                                       |
| `priority`    | `low` · `normal` · `high` or null | null when no priority marker was given                                                                                |
| `understood`  | list of `{ field, value, text }`  | what was recognised and the words that produced it. `field` is `title`, `dueDate`, `dueTime`, `project` or `priority` |

### 2.9 Search result

`{ "tasks": [TaskView], "entries": [EntryView] }`.

### 2.10 Settings (`SettingsView`)

| Field               | Type                                    | Meaning                                                               |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `timeZone`          | IANA name, for example `Europe/Paris`   | default `UTC`                                                         |
| `quietHours`        | `{ "start": "HH:MM", "end": "HH:MM" }`  | default `21:00` to `08:00`                                            |
| `firstRunCompleted` | boolean                                 | default false                                                         |
| `consent`           | object keyed by switch name (section 8) | each switch: `{ "enabled": boolean, "changedAt": timestamp or null }` |

---

## 3. Rules

### 3.1 Capture and the Inbox

- A task needs only a title. Without a project it is in the **Inbox**: a top-level, open task with no project.
- A date or time does not move a task out of the Inbox. Dated tasks also appear in Today and fresh-look (see the owner review list in the handoff note).
- The quick-add parser (section 11) reads one line of text and returns the fields. It creates nothing. The interface then calls `POST /api/tasks` with the fields it shows.

### 3.2 Tasks, subtasks and projects

- A **subtask** is a task with `parentTaskId`. Subtasks go one level deep only: a subtask cannot have its own subtask. Breaking down a subtask is a `conflict`.
- A subtask has no project (it belongs to its parent's list) and no recurrence. It may have a date, a time, energy and an estimate.
- Top-level lists (`GET /api/tasks`, the Inbox, Today, fresh-look, resurfacing, suggestions) show top-level tasks only. A subtask is shown under its parent in the detail view.
- Deleting a project keeps its tasks and entries: they lose the project link.
- Every change a person makes to a task counts as activity (`lastActivityAt`), **except** snoozing. Creating a subtask directly with `parentTaskId` does not update the parent's activity; a break-down does.

### 3.3 Recurrence

**Model.** A repeating task has a rule, a start date and optionally a paused flag. It has no date of its own. Its **current occurrence** is computed each time it is read. There is no scheduler.

**Current occurrence.** Let _N_ be the first occurrence on or after today. If _N_ already has a record (completed or skipped), the current occurrence is the next occurrence after _N_. Otherwise it is _N_.

**Silent skips.** An occurrence that has passed with no record is **skipped silently**. Nothing is stored for it and nothing is shown as a pile-up. It counts only toward `consecutiveSkips`.

**Consecutive skips.** Counting back from the current occurrence, the count goes up for each occurrence that has no `completed` record, whether it was passed silently or explicitly skipped. The count stops at a completion or at the start date. It looks back at most 60 occurrences. When the count reaches **3**, `adjustSuggested` is true, and the product offers to adjust the rule or pause it.

**Acting on an occurrence.**

- `POST /api/tasks/:id/complete` and `POST /api/tasks/:id/skip` **must name the occurrence** with `occurrenceDate` (the date the person saw). Without it the request is `validation_failed` on `occurrenceDate`.
  This is deliberate. If the current occurrence were used by default, a repeated request (a double tap, an offline retry) would act on the **next** occurrence.
- The date must be one of the rule's occurrences, or the request is `validation_failed`.
- Acting on an occurrence that already has a record returns the task unchanged (`200`).
- Acting on a **paused** task is a `conflict`.
- Completing or skipping sets the task's status back to `pending`, so the next occurrence starts fresh.
- Completion and skip are recorded once per (task, occurrence). The database enforces this.

**Restrictions.**

- `complete` with `status: completed` through `PATCH` is a `conflict` for a repeating task.
- `skip` on a one-off task is a `conflict`.
- A repeating task's own date cannot be set (`PATCH dueDate` or `reschedule` is a `conflict`). Change the rule or the start date instead.

**Changing the rule.** `PATCH /api/tasks/:id` with a new `recurrence` object changes the rule, the start date (`startDate`, or else the date given, or else the current start), and `paused`. Setting `recurrence: null` makes the task a one-off, keeping the date given in the same request if there is one.

**Pausing.** `recurrence.paused: true` removes the current occurrence. Resuming with `paused: false` restores it. Pausing does not change the records.

### 3.4 Today: plan and suggestions

**Plan.** One plan per calendar day. It is an ordered list of tasks plus a `confirmed` flag. Editing is always allowed. The plan is replaced as a whole by `PUT /api/plans/:date`. Passing `confirmed: true` confirms it. Leaving out `confirmed` keeps the current flag.

**Suggestion.** The rules pick up to **5** open, top-level tasks (`TODAY_SUGGESTION_SIZE`). A task is eligible when at least one reason applies:

| Reason          | When                                                                  | Points |
| --------------- | --------------------------------------------------------------------- | ------ |
| `due_today`     | its date is today **or earlier** (shown as today, never as a failure) | 5      |
| `due_soon`      | its date is within the next 2 days                                    | 3      |
| `in_progress`   | status is in progress                                                 | 3      |
| `high_priority` | priority is high                                                      | 2      |
| `resurfacing`   | no activity for 7 days                                                | 2      |

Low priority subtracts 1 point. Tasks are ordered by points (highest first), then by date (earliest first, no date last), then by manual order, then by the longest time without activity.

Excluded: tasks snoozed past today, paused repeating tasks, and tasks that need more energy than the chosen level (`energy` query parameter). Tasks with no energy level are always kept. The suggestion does not look at the plan: a task already planned can still be suggested.

**Energy filter.** `low` keeps tasks whose energy is `low` or unset. `medium` keeps `low`, `medium` and unset. `high` keeps everything.

### 3.5 Fresh look and resurfacing

**Stale.** A task is stale when its `lastActivityAt` is at least 7 days ago (`STALE_THRESHOLD_DAYS`). Activity is a change to the task itself: any edit, reschedule, complete, skip, drop or break-down. Creating or editing an entry linked to a task does not count. Snoozing is not activity.

**Fresh look.** A task appears when its reason is one of:

- `date_passed`: a one-off task whose date is before today and that is not completed.
- `stale`: the task is stale.

Repeating tasks can only be `stale`. A completed task, a snoozed task (snoozed past today) or a paused repeating task never appears. Order: `date_passed` first (earliest date first), then `stale` (longest without activity first).

**Resurfacing.** The stale tasks that are not snoozed and not paused, longest without activity first. Today uses it, and so does the Nudges agent through the service layer.

**Actions.** The fresh-look card offers the actions below, each a separate endpoint:

- **Reschedule**: `POST /api/tasks/:id/reschedule` with a new `dueDate` (or `null`), and `dueTime` if wanted.
- **Simplify**: `PATCH /api/tasks/:id`, as for any edit.
- **Break down**: `POST /api/tasks/:id/breakdown` with 1 to 10 steps.
- **Snooze**: `POST /api/tasks/:id/snooze` with `until` (default today plus 3 days; must be after today and at most a year away).
- **Drop**: `POST /api/tasks/:id/drop`. The task and its subtasks disappear from every list. They stay in the export. Nothing in the app shows a dropped task again.

**Candidate pool.** Suggestions, fresh-look and resurfacing read the same pool: the open top-level tasks, least recently touched first, up to 300 (`CANDIDATE_POOL_LIMIT`). With more than 300 open tasks, the newest-activity ones are not considered until the older ones change.

### 3.6 Entries and search

- Entries can link to a task and to a project (both optional). A link must point at a task or project the person can see; otherwise the request is `validation_failed` on `taskId` or `projectId`.
- Deleting a task or project keeps its entries; the link is cleared.
- **Search** (`GET /api/search?q=…`) uses Postgres full-text search with the `simple` configuration (no language stemming, so it works for any language). The query is split into words, and each word is matched as a **prefix** (`zucch` finds `zucchini`). All words must match. Only letters and digits count; other characters are ignored. Text with no words is `validation_failed` on `q`.
- Search covers task titles (not dropped tasks) and entry titles and bodies.

### 3.7 Settings and consent

- The four switches start **off**. A switch records when it was last changed (`changedAt`, null if never). Setting a switch to the value it already has leaves `changedAt` as it was.
- The switches are stored here. The AI and Nudges agents enforce them on the server, on every path, including internal callers. This API does not decide what the AI may see.
- Time zone: must be a valid IANA name. Changing it changes what "today" means from the next request on.
- Quiet hours are stored only. The Nudges agent applies them.

---

## 4. Endpoints

All endpoints need a session. "Body" is the JSON body; "Query" is the URL query string. Response bodies are the shapes in section 2.

### 4.1 Projects

| Method and path            | Body / query                 | Responses                                     |
| -------------------------- | ---------------------------- | --------------------------------------------- |
| `GET /api/projects`        | —                            | 200 `{ projects: [Project] }` (at most 200)   |
| `POST /api/projects`       | `{ name, clientRequestId? }` | 201 `Project` · 200 same id again · 400       |
| `GET /api/projects/:id`    | —                            | 200 `Project` · 404                           |
| `PATCH /api/projects/:id`  | `{ name?, position? }`       | 200 `Project` · 404 · 400                     |
| `DELETE /api/projects/:id` | —                            | 204 · 404 (tasks and entries keep their data) |

### 4.2 Tasks

| Method and path                  | Body / query                                                                                                                                                                     | Responses                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/tasks`                 | `projectId=none` or uuid · `parentTaskId=uuid` · `status=open` (default) \| `completed` \| `all` · `limit` · `offset`                                                            | 200 `TaskPage` `{ tasks, limit, offset, hasMore }` · 400 |
| `POST /api/tasks`                | `{ title, projectId?, parentTaskId?, dueDate?, dueTime?, priority?, energy?, estimateMinutes?, recurrence?, status?, clientRequestId? }`. `status` is `pending` or `in_progress` | 201 `TaskView` · 200 same id again · 400                 |
| `GET /api/tasks/:id`             | —                                                                                                                                                                                | 200 `TaskDetailView` · 404                               |
| `PATCH /api/tasks/:id`           | any of `title`, `status`, `projectId`, `dueDate`, `dueTime`, `priority`, `energy`, `estimateMinutes`, `recurrence`, `position`                                                   | 200 `TaskView` · 400 · 404 · 409                         |
| `DELETE /api/tasks/:id`          | —                                                                                                                                                                                | 204 · 404 (removes subtasks and history)                 |
| `POST /api/tasks/:id/complete`   | `{ occurrenceDate? }`. **Required for a repeating task.**                                                                                                                        | 200 `TaskView` · 400 · 404 · 409 (paused)                |
| `POST /api/tasks/:id/skip`       | `{ occurrenceDate }`. Repeating tasks only                                                                                                                                       | 200 `TaskView` · 400 · 404 · 409                         |
| `POST /api/tasks/:id/drop`       | —                                                                                                                                                                                | 204 · 404                                                |
| `POST /api/tasks/:id/snooze`     | `{ until? }`                                                                                                                                                                     | 200 `TaskView` · 400 · 404                               |
| `POST /api/tasks/:id/reschedule` | `{ dueDate (or null), dueTime? }`. One-off tasks only                                                                                                                            | 200 `TaskView` · 400 · 404 · 409                         |
| `POST /api/tasks/:id/breakdown`  | `{ steps: [{ title, clientRequestId? }] }` (1 to 10). Main tasks only                                                                                                            | 200 `TaskDetailView` · 400 · 404 · 409                   |
| `GET /api/inbox`                 | `limit` · `offset`                                                                                                                                                               | 200 `TaskPage` (open, top-level, no project)             |

Notes:

- `PATCH` rules are in 3.2 and 3.3. A `status` of `completed` on a one-off task sets `completedAt`. Any other status clears it.
- `PATCH` with `recurrence` as an object sets or changes the rule. `null` removes it.
- `DELETE` is permanent. `drop` is the gentle choice for a task the person no longer wants.

### 4.3 Today, plans, fresh look and resurfacing

| Method and path              | Body / query                                          | Responses                                                    |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/today`             | —                                                     | 200 `TodayView`                                              |
| `GET /api/today/suggestions` | `energy=low` \| `medium` \| `high` (optional)         | 200 `SuggestionsView` · 400                                  |
| `GET /api/plans/:date`       | —                                                     | 200 `DayPlanView` (empty when no plan) · 400 bad date        |
| `PUT /api/plans/:date`       | `{ taskIds: [uuid] (0 to 10, distinct), confirmed? }` | 200 `DayPlanView` · 400 (unknown task, duplicates, too many) |
| `GET /api/fresh-look`        | `limit`                                               | 200 `{ items: [{ task, reason }] }`                          |
| `GET /api/resurfacing`       | `limit` (max 20)                                      | 200 `{ tasks: [TaskView] }`                                  |

### 4.4 Quick-add

| Method and path             | Body                             | Responses                                  |
| --------------------------- | -------------------------------- | ------------------------------------------ |
| `POST /api/quick-add/parse` | `{ text }` (1 to 500 characters) | 200 `QuickAddView`. Creates nothing. · 400 |

### 4.5 Entries

| Method and path           | Body / query                                                                                                | Responses                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `GET /api/entries`        | `kind` · `taskId` · `projectId` · `from` · `to` (dates, inclusive) · `limit` · `offset`                     | 200 `{ entries, limit, offset, hasMore }` · 400 |
| `POST /api/entries`       | `{ kind, title?, body?, entryDate?, taskId?, projectId?, clientRequestId? }`. `entryDate` defaults to today | 201 `EntryView` · 200 same id again · 400       |
| `GET /api/entries/:id`    | —                                                                                                           | 200 `EntryView` · 404                           |
| `PATCH /api/entries/:id`  | any of `kind`, `title`, `body`, `entryDate`, `taskId`, `projectId` (null clears a link)                     | 200 `EntryView` · 400 · 404                     |
| `DELETE /api/entries/:id` | —                                                                                                           | 204 · 404                                       |

### 4.6 Search

| Method and path   | Query                                                  | Responses                      |
| ----------------- | ------------------------------------------------------ | ------------------------------ |
| `GET /api/search` | `q` (required, 1 to 200 characters) · `limit` (max 50) | 200 `{ tasks, entries }` · 400 |

### 4.7 Settings and consent

| Method and path               | Body                                                                                      | Responses                |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| `GET /api/settings`           | —                                                                                         | 200 `SettingsView`       |
| `PATCH /api/settings`         | any of `timeZone`, `quietHoursStart`, `quietHoursEnd`, `firstRunCompleted`                | 200 `SettingsView` · 400 |
| `PATCH /api/settings/consent` | any of `ai_features`, `ai_notes_journal`, `ai_profile`, `nudges` (booleans). At least one | 200 `SettingsView` · 400 |

### 4.8 Account

| Method and path            | Body                                          | Responses                                                                                           |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/account/export`  | —                                             | 200 `application/zip`, an attachment named `flowzone-export-YYYY-MM-DD.zip`                         |
| `POST /api/account/delete` | `{ "confirm": "DELETE" }` (exactly this text) | 200 `{ "deleted": true }`, and the session cookies are cleared · 400 when the confirmation is wrong |

### 4.9 First run (the frontend's sequence)

1. `GET /api/settings`. If `firstRunCompleted` is false, the app is on its first run.
2. `PATCH /api/settings` with the browser's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and `firstRunCompleted: true`.
3. Consent is not asked here. The AI and Nudges agents own those screens and use `PATCH /api/settings/consent`.

### 4.10 Export file layout

The ZIP contains:

| Path                            | Content                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `README.txt`                    | what each part is, the time zone and the date                                                   |
| `manifest.json`                 | format name and version, the parts and the file list                                            |
| `data/account.json`             | email and name                                                                                  |
| `data/settings.json`            | the settings view                                                                               |
| `data/projects.json`            | all projects                                                                                    |
| `data/tasks.json`               | all tasks, including dropped ones (`droppedAt` is set for those), each with its recurrence view |
| `data/recurrence-records.json`  | every completion and skip record                                                                |
| `data/day-plans.json`           | every plan, with its tasks in order                                                             |
| `data/entries.json`             | all entries                                                                                     |
| `readable/tasks.md`             | tasks as a checklist grouped by project, subtasks indented, dropped tasks at the end            |
| `readable/notes-and-journal.md` | notes and journal text, newest first                                                            |

Files are UTF-8. The archive is stored without compression, so any unzip tool can open it.

---

## 5. Example flows

**Quick capture.** The person types "Call Sam tomorrow at 5pm #Work !high". The interface calls `POST /api/quick-add/parse`, which returns the title "Call Sam", tomorrow's date, `17:00`, the project name "Work" with its id when one matches, and high priority. The interface shows these, the person corrects anything, and then `POST /api/tasks` creates the task with a fresh `clientRequestId`. A retry of the same request returns the same task.

**A repeating habit left alone.** A daily habit started six days ago has never been completed. Its `recurrence.consecutiveSkips` is 6 and `adjustSuggested` is true. Nothing was written for the six days. The person opens the app; the task's `dueDate` is today. They complete it with `occurrenceDate` = today. Tomorrow becomes the current occurrence, the count drops to 0 and the flag clears.

**A double tap.** The person taps "complete" twice on a repeating task, both with `occurrenceDate` = today. The first records today. The second finds today already recorded and returns the task unchanged. Tomorrow is still the current occurrence.

**Planning the day.** The interface calls `GET /api/today/suggestions?energy=medium`, shows up to 5 tasks with their reasons, and lets the person pick. It sends the chosen tasks in order with `PUT /api/plans/<today>` and `confirmed: true`. Later it can reorder the plan with another `PUT`. The plan does not need confirming again.

**Fresh look.** The person opens the fresh-look card. `GET /api/fresh-look` returns a task that had a date two days ago and was never completed, with reason `date_passed`, and a task with no activity for a week, with reason `stale`. For the first they choose to reschedule it (`POST …/reschedule`). For the second they choose to break it down (`POST …/breakdown` with three steps). A third task they do not want anymore is dropped (`POST …/drop`), and it leaves every list.

**Account deletion.** The person chooses to delete their account, types DELETE, and calls `POST /api/account/delete`. The server signs them out, runs every lifecycle handler, removes the account record and every row linked to it, and returns the cleared cookies. Signing in again would create a new, empty account (if the email is still allowed).

---

## 6. Service layer

All domain logic lives in `src/services/`. Route handlers only check the request and call a service. The AI agent's tools and the Nudges agent call the same functions in server code, with no HTTP.

### 6.1 Context

Every service function takes a `ServiceContext`, built once per request or background job:

```ts
import { createServiceContext } from "@/services/context";
const ctx = await createServiceContext(user); // user: a UserContext from requireUser() or contextForUser()
// ctx.scope    the person's scoped data layer (forUser)
// ctx.today    today's date in their time zone
// ctx.timeZone their time zone
// ctx.now      the instant the context was made
```

Background work uses `contextForUser(id)` (Foundation section 2) and then `createServiceContext`. Never mix people in one context.

### 6.2 Functions

| Area         | Functions                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context      | `createServiceContext(user)`, `ensureSettings(scope)`                                                                                                                                         |
| Projects     | `listProjects`, `createProject`, `getProject`, `updateProject`, `deleteProject`                                                                                                               |
| Tasks        | `createTask`, `updateTask`, `getTaskDetail`, `listTasks`, `completeTask`, `skipOccurrence`, `dropTask`, `snoozeTask`, `rescheduleTask`, `breakDownTask`, `deleteTask`, `quickAdd`, `loadTask` |
| Today        | `getToday`, `getPlan(ctx, date)`, `putPlan(ctx, date, body)`, `suggestionsFor(ctx, energy)`, `freshLook(ctx, limit)`, `resurfacingCandidates(ctx, limit)`                                     |
| Entries      | `createEntry`, `listEntries`, `getEntry`, `updateEntry`, `deleteEntry`                                                                                                                        |
| Search       | `search(ctx, text, limit)`                                                                                                                                                                    |
| Settings     | `getSettings(ctx)`, `consentSwitches(ctx)` (booleans for the four switches), `updateSettings`, `updateConsent`                                                                                |
| Lifecycle    | `buildExportArchive(ctx)`, `deleteAccount(ctx)`                                                                                                                                               |
| Rules (pure) | `resolveRecurrence`, `nextOccurrence`, `previousOccurrence`, `isOccurrence`, `freshLookReason`, `isStale`, `rankSuggestions`, `parseQuickAdd`                                                 |

Inputs are typed with the request schemas (`z.infer<typeof createTaskSchema>` and so on), so an AI tool can use the same shapes as the API.

### 6.3 Errors from services

Services throw `ApiError` (from `@/server/http/errors`) with the codes in section 1.2. Non-HTTP callers should catch `ApiError` and read `code` and `message`. The message is safe to show a person.

### 6.4 Writing values

Use the typing helpers in `src/services/db-types.ts` when you write a row: `satisfies InsertOf<typeof table>` for creates, and `patchFor<typeof table>({…})` for updates. This works around an incomplete type in the scoped layer (handoff note, "Blockers raised to Foundation").

---

## 7. Data lifecycle registry

Every export and every account deletion runs through one list: `LIFECYCLE_HANDLERS` in `src/services/lifecycle/registry.ts`.

### 7.1 The handler

```ts
export interface LifecycleHandler {
  readonly id: string; // unique and stable, for example "core" or "ai.chat"
  readonly title: string; // shown in the export's README
  exportFiles(ctx: ServiceContext): Promise<ExportFile[]>; // { path, content } (UTF-8 text)
  deleteData(ctx: ServiceContext): Promise<void>; // removes everything this domain holds for the person
}
```

### 7.2 Rules

- **Export paths** are relative, use forward slashes, do not start with `/`, and never contain `..`. Two handlers may not produce the same path. The export is refused otherwise.
- **Readable and structured.** Give each part a JSON file for other tools and, where it helps, a Markdown or text file for people. Notes and journal text are always readable.
- **Deletion is complete.** A handler deletes its own rows explicitly and also anything outside the database (for example push subscriptions). Rows with `user_id` are removed automatically when the account is deleted (`ON DELETE CASCADE`).
- **Deletion is retry-safe.** Each `deleteData` deletes what is left, so a repeat after a failure is fine.
- **Ids and secrets.** Export files should not include secrets or provider keys. Nothing exported is logged.

### 7.3 How another agent registers a handler

1. Create `src/services/<area>/lifecycle.ts`, exporting a `LifecycleHandler`. Use `ctx.scope` for your tables (`forUser` is already applied), and `ctx.user` for the account.
2. Open `src/services/lifecycle/registry.ts`. Import your handler and append it to `LIFECYCLE_HANDLERS`. The order is the order of deletion. Core stays first.
3. Run an export (`GET /api/account/export`) and check your files appear and read well. Run account deletion on a development account and check your rows are gone.

The AI agent adds chat history, the action log, pending confirmations, profile items and usage counters. The Nudges agent adds the nudge log, snoozes and mutes, and push subscriptions (its deletion must also remove push subscriptions held outside the database).

---

## 8. Consent switches

The four canonical names. They are used as database column names, JSON keys and in code. Never rename them.

| Name               | Turns on                             |
| ------------------ | ------------------------------------ |
| `ai_features`      | all AI features                      |
| `ai_notes_journal` | AI reading of notes and journal text |
| `ai_profile`       | the AI's profile of the person       |
| `nudges`           | nudges and push notifications        |

All four default to **off**. The enforcing agents check them on the server, on every path. This API stores them and reports them. See `src/shared/consent.ts`.

---

## 9. Tuning constants

Every number that shapes behaviour is in one file: **`src/shared/tuning.ts`**. Change it there, nowhere else.

| Constant                                              | Value             | Meaning                                                                        |
| ----------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `TODAY_SUGGESTION_SIZE`                               | 5                 | the most suggestions Today proposes                                            |
| `TODAY_PLAN_MAX_ITEMS`                                | 10                | the most tasks in one day's plan                                               |
| `STALE_THRESHOLD_DAYS`                                | 7                 | days without activity before a task is stale                                   |
| `CONSECUTIVE_SKIPS_THRESHOLD`                         | 3                 | consecutive skips that set `adjustSuggested`                                   |
| `CONSECUTIVE_SKIPS_LOOKBACK`                          | 60                | how many occurrences the skip count looks back over (the count is capped here) |
| `DUE_SOON_DAYS`                                       | 2                 | days ahead that count as "due soon"                                            |
| `SNOOZE_DEFAULT_DAYS`                                 | 3                 | default snooze length                                                          |
| `LIST_DEFAULT_LIMIT` / `LIST_MAX_LIMIT`               | 50 / 200          | list pages                                                                     |
| `FRESH_LOOK_DEFAULT_LIMIT`                            | 20                | fresh-look page                                                                |
| `RESURFACING_DEFAULT_LIMIT` / `RESURFACING_MAX_LIMIT` | 3 / 20            | resurfacing page                                                               |
| `SEARCH_DEFAULT_LIMIT` / `SEARCH_MAX_LIMIT`           | 20 / 50           | search page                                                                    |
| `CANDIDATE_POOL_LIMIT`                                | 300               | open tasks examined by the attention rules                                     |
| `BREAKDOWN_MAX_STEPS`                                 | 10                | steps in one break-down                                                        |
| `DEFAULT_TIME_ZONE`                                   | `UTC`             | until the first run sets it                                                    |
| `DEFAULT_QUIET_HOURS_START` / `END`                   | `21:00` / `08:00` | quiet hours                                                                    |
| `TITLE_MAX_LENGTH`                                    | 500               |                                                                                |
| `PROJECT_NAME_MAX_LENGTH`                             | 80                |                                                                                |
| `ENTRY_TITLE_MAX_LENGTH` / `ENTRY_BODY_MAX_LENGTH`    | 200 / 20 000      |                                                                                |
| `ESTIMATE_MIN_MINUTES` / `ESTIMATE_MAX_MINUTES`       | 1 / 1440          |                                                                                |

The database check constraint for estimates uses the same two values.

---

## 10. Database schema

All tables below are user-owned (made with `userOwnedTable()`, Foundation section 3). Each has the standard columns (`id`, `user_id`, `client_request_id`, `created_at`, `updated_at`). Every index starts with `user_id`. Schema files: `src/server/db/schema/`. Migration: `drizzle/0001_good_sleeper.sql`.

| Table                | Columns (besides the standard ones)                                                                                                                                                                                                                                                                                                                                                            | Notes                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `projects`           | `name`, `position`                                                                                                                                                                                                                                                                                                                                                                             | flat                                     |
| `tasks`              | `title`, `status` (enum `task_status`), `project_id` → projects (set null), `parent_task_id` → tasks (cascade), `due_date`, `due_time`, `priority` (enum `task_priority`), `energy` (enum `task_energy`), `estimate_minutes` (check 1–1440), `recurrence_rule` (jsonb), `recurrence_start`, `recurrence_paused`, `position`, `completed_at`, `last_activity_at`, `snoozed_until`, `dropped_at` | full-text index on the title             |
| `recurrence_records` | `task_id` → tasks (cascade), `occurrence_date`, `outcome` (enum `recurrence_outcome`)                                                                                                                                                                                                                                                                                                          | unique per (user, task, occurrence date) |
| `entries`            | `kind` (enum `entry_kind`), `title`, `body`, `entry_date`, `task_id` → tasks (set null), `project_id` → projects (set null)                                                                                                                                                                                                                                                                    | full-text index on title and body        |
| `day_plans`          | `plan_date`, `confirmed`, `confirmed_at`                                                                                                                                                                                                                                                                                                                                                       | unique per (user, date)                  |
| `day_plan_items`     | `day_plan_id` → day_plans (cascade), `task_id` → tasks (cascade), `position`                                                                                                                                                                                                                                                                                                                   | unique per (plan, task)                  |
| `user_settings`      | `time_zone`, `quiet_hours_start`, `quiet_hours_end`, `first_run_completed`, and for each switch its boolean and `*_changed_at`                                                                                                                                                                                                                                                                 | one row per person                       |

Time columns use `timestamptz`. Calendar-date columns use `date`, so they never move with a time zone.

---

## 11. Quick-add grammar

Read left to right, case-insensitive. A marker must start the text or follow a space. Connector words ("on", "by", "due", "for", "at") in front of a date or time are consumed with it.

| Written                                         | Means                                                 |
| ----------------------------------------------- | ----------------------------------------------------- |
| `#Work` or `#"Home renovation"`                 | project name (the first one wins; others are removed) |
| `!high`, `!low`, `!normal`, `!!`                | priority (`!!` is high)                               |
| `today`, `tomorrow`                             | due date                                              |
| `in 3 days`, `in 2 weeks`                       | due date relative to today                            |
| `monday` … `sunday`                             | the next such day, today included                     |
| `next monday`                                   | the such day strictly after today                     |
| `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` | a weekday, only after on / by / due / for / at / next |
| `2026-11-20`                                    | an ISO date                                           |
| `Nov 20`, `20 November`, `20th of Nov`          | the next such date, this year or next                 |
| `5pm`, `5:30 pm`, `17:30`, `at 9:15 am`, `noon` | time of day. With no date, the date is today          |

Rules:

- The first date form that matches wins, and so does the first time.
- Numeric dates such as `11/12` are **not** recognised, because their meaning depends on the locale.
- Whatever is left after the markers, tidied up, is the title. If nothing is left, the original text is the title.
- `understood` lists each field with its words, so the interface can show it.

Examples:

| Input (today is Saturday 2026-11-14)   | Result                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `Call Sam tomorrow at 5pm #Work !high` | title "Call Sam", 2026-11-15, 17:00, project "Work", high      |
| `Buy oat milk`                         | title "Buy oat milk", nothing else (Inbox)                     |
| `Dentist 2026-12-03 9:30`              | title "Dentist", 2026-12-03, 09:30                             |
| `Pay rent on Nov 30`                   | title "Pay rent", 2026-11-30                                   |
| `Send report friday`                   | title "Send report", 2026-11-20                                |
| `Pick up parcel on sun`                | title "Pick up parcel", 2026-11-15                             |
| `Sun cream`                            | title "Sun cream" (no date: the short form needs a connector)  |
| `Water plants in 2 weeks !!`           | title "Water plants", 2026-11-28, high                         |
| `Lunch with Ana at noon`               | title "Lunch with Ana", today, 12:00                           |
| `Learn C# basics`                      | title "Learn C# basics" (a `#` inside a word is not a project) |
