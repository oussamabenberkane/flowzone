# Nudges contract

Owner: the Nudges agent (Agent 6). **Read-only for everyone else.** Others may read this document and must not change it. If something here blocks you, write the problem in your handoff note.

This is the contract for nudges: when a gentle, useful note is sent, the rules that decide it, the scheduled tick that runs them, web push delivery, the per-device and per-task controls, and the notification format. It is written to match the implementation. Where the two disagree, that is a bug to report.

Read first: [`foundation.md`](foundation.md) (user scoping, errors, environment variables), [`api.md`](api.md) (the service layer, resurfacing, fresh look, settings and consent, the lifecycle registry) and [`ai.md`](ai.md) (the wording function).

Contents: [1 Principles](#1-principles) · [2 The tick endpoint](#2-the-tick-endpoint) · [3 The engine rules](#3-the-engine-rules) · [4 Endpoints](#4-endpoints) · [5 Nudge types and wording](#5-nudge-types-and-wording) · [6 Push delivery and devices](#6-push-delivery-and-devices) · [7 Service worker](#7-service-worker) · [8 Tables](#8-tables) · [9 Interface](#9-interface) · [10 Data lifecycle](#10-data-lifecycle) · [11 Constants](#11-constants) · [12 Environment and secrets](#12-environment-and-secrets) · [13 Known limits](#13-known-limits)

---

## 1. Principles

- **Off by default.** Nudges run only for a person whose `nudges` switch is on (`api.md`, section 8). With the switch off, nothing is read for nudges and nothing is sent.
- **Rare, kind, always with a reason.** Every nudge states why it was sent. Nothing is ever worded as guilt or pressure, and the word "overdue" is never shown.
- **Suggest, never change data.** A nudge does not edit, complete, reschedule, snooze or drop a task. The nudge's own mute and snooze are kept in nudge tables only. Tapping a notification opens the task (or Today or Settings).
- **Deterministic rules.** Which nudge is chosen is decided by fixed rules. AI only words a nudge that was already chosen, and only when allowed.
- **Web push only, self-hosted.** Standard web push with VAPID keys the app generated itself. No third-party push service. Messages are encrypted for the browser before they leave the server.

## 2. The tick endpoint

`POST /api/nudges/tick`, called by the scheduler every 30 minutes (`.github/workflows/nudges-tick.yml`).

**Security, in order:**

1. If `NUDGE_TICK_SECRET` is not set, the endpoint answers `404 not_found` (it does not exist).
2. The header `x-flowzone-tick-secret` must equal the secret. Comparison is constant-time (both sides hashed first). Missing or wrong: `401 unauthenticated`.
3. It is the one route that touches people's data without a session. It therefore returns **counts only**: no ids, titles, texts or endpoints, in the response or in logs. Failures for one person are logged as an event name and error type, never as content.

**Safe to call twice.** Decisions are made per person per 30-minute window (the start of the window, in UTC ISO form). Each decision reserves its window in the nudge log with the client request id `tick-<window>`. A second call in the same window finds the reservation and sends nothing (`already_handled`).

**Test-only clock.** `POST /api/nudges/tick?asOf=2026-11-14T21:30:00Z` evaluates the run at that instant. It is answered with `404` unless `NUDGE_TEST_CLOCK=true` **and** the deployment is not production. That is re-checked on every request from the raw environment (`nudgeTestClockAllowed` in `src/server/env.ts`), and the app refuses to start if the flag is set in production. A malformed `asOf` is `validation_failed`.

**Response** (200):

```json
{
  "ok": true,
  "window": "2026-11-14T21:30:00.000Z",
  "evaluated": 2,
  "sent": 1,
  "skipped": { "quiet_hours": 1 }
}
```

`skipped` counts people by reason code (section 3.2). Nothing else.

**Scheduler.** GitHub Actions runs the job at `*/30 * * * *` and on manual trigger (`workflow_dispatch`). It needs the repository variable `FLOWZONE_APP_URL` and the repository secret `NUDGE_TICK_SECRET`. Scheduled runs are "about when", not exact: GitHub may delay them. Vercel's cron is not used (the free tier allows daily runs only).

## 3. The engine rules

### 3.1 Order

For each allowed person, in one window (`src/services/nudges/engine.ts`, `decideAndSend`):

1. **Consent.** The `nudges` switch is on, else `nudges_off`.
2. **Quiet hours.** The person's local time (their time zone, `settings.timeZone`) is not inside `quietHours` (default 21:00 to 08:00; a window that crosses midnight is handled). Otherwise `quiet_hours`.
3. **A device.** At least one device accepts notifications, else `no_device`.
4. **Daily cap.** Fewer than `NUDGE_DAILY_CAP` nudges already belong to today (the person's local day) with outcome `pending` or `sent`. Every nudge type counts. Otherwise `daily_cap`.
5. **Candidates and gates** (section 3.3): choose the single best candidate that passes every gate, else the first blocking reason (`task_gap`, `muted`, `snoozed`, `check_in_gap`) or `no_candidate`.
6. **Reserve, word, send, log.** The window is reserved (duplicate windows stop here, `already_handled`). The daily cap is counted again including the reservation, in case a parallel run took the last place (`daily_cap`, and the reservation is marked `cancelled`). The wording is chosen (section 5.2). The push is sent to each device, and the log row is set to `sent` (at least one device accepted) or `failed`.

At most one nudge is sent per person per window.

### 3.2 Skip reasons

`nudges_off` · `quiet_hours` · `daily_cap` · `no_device` · `no_candidate` · `task_gap` · `muted` · `snoozed` · `check_in_gap` · `already_handled` · `error`. These are the only skip codes; the tick response uses them.

### 3.3 Candidates

Candidates come only from the service layer (`src/services/nudges/candidates.ts`). Nothing here re-derives the attention rules.

| Kind        | Source                                                                                                                                           | Reason code         | Reason phrase                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------- |
| `due_soon`  | open top-level tasks due **today** with a time that is between now and `NUDGE_DUE_SOON_LEAD_MINUTES` ahead. A time already passed is never used. | `due_at`            | "due at 5:00 pm"                 |
| `due_soon`  | open top-level tasks due **today** with no time                                                                                                  | `due_today`         | "due today"                      |
| `check_in`  | the fresh-look queue's `date_passed` items (one-off tasks planned for an earlier day)                                                            | `planned_earlier`   | "was planned for an earlier day" |
| `resurface` | the resurfacing candidates (quiet for `STALE_THRESHOLD_DAYS`)                                                                                    | `quiet_for_a_while` | "has been quiet for a while"     |

Tasks skipped before gating: paused repeating tasks, tasks with a task-level snooze past today, and titles containing a forbidden phrase (a borderline candidate is not sent).

### 3.4 Gates and choice

- **Per-task gap:** no nudge for the same task with outcome `pending` or `sent` in the last `NUDGE_TASK_GAP_HOURS` (72), measured on the decision time.
- **Check-in gap:** at most one `check_in` nudge in `NUDGE_CHECK_IN_GAP_HOURS` (72), for any task. This is how "at most one gentle check-in at a time" is kept.
- **Mute** (`nudge_task_controls.muted`) and **snooze** (`snoozedUntil` in the future) skip the task.
- **Choice:** kinds are ranked `due_soon`, `check_in`, `resurface`. Within a kind, the source order is kept (timed tasks earliest first). The first candidate that passes every gate is sent.

### 3.5 Decision time

Every rule uses the context's clock (`ctx.now`, `ctx.today`). In normal runs that is the real clock. With the test-only clock it is the `asOf` instant. Gap and cap windows use the `decided_at` column, never the database's `created_at`, so tests stay deterministic.

## 4. Endpoints

All need a session unless marked. Errors use the Foundation shape.

| Method and path                  | Body                                                     | Responses                                                                                            |
| -------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /api/nudges/tick`          | none; header `x-flowzone-tick-secret`; optional `?asOf=` | 200 `NudgeTickResultView` · 401 · 404 · 400. **No session** (section 2).                             |
| `GET /api/nudges/devices`        | —                                                        | 200 `{ configured, publicKey, devices: [NudgeDeviceView] }`                                          |
| `POST /api/nudges/devices`       | `{ endpoint, keys: { p256dh, auth }, label }`            | 200 `NudgeDeviceView` (the same endpoint again updates it) · 409 nudges off or push not set up · 400 |
| `DELETE /api/nudges/devices/:id` | —                                                        | 204 · 404. Allowed even with nudges off.                                                             |
| `POST /api/nudges/test`          | —                                                        | 200 `{ delivered, failed, gone }` · 409 nudges off or no device                                      |
| `GET /api/nudges/tasks/:id`      | —                                                        | 200 `TaskNudgeControlView` · 404                                                                     |
| `PUT /api/nudges/tasks/:id`      | `{ muted?, snoozed? }` (at least one)                    | 200 `TaskNudgeControlView` · 400 · 404                                                               |

`NudgeDeviceView`: `{ id, label, createdAt, lastSuccessAt, endpointHash }`. The endpoint and keys are never returned. `endpointHash` is the SHA-256 (hex) of the endpoint, so the browser can recognise its own device.

`TaskNudgeControlView`: `{ taskId, muted, snoozedUntil }`. Snoozing sets `snoozedUntil` to now plus `NUDGE_SNOOZE_DAYS`. `snoozed: false` clears it. A task that is not muted and not snoozed has no control row.

The test endpoint is user-initiated and is **not** a nudge: it does not count toward the cap and is not written to the nudge log. Its text says it was asked for in Settings.

## 5. Nudge types and wording

### 5.1 The three types

- `due_soon`: a task with a time or date coming up (section 3.3).
- `check_in`: one gentle look at a task that was planned for an earlier day.
- `resurface`: a task that has gone quiet and deserves attention.

### 5.2 Wording

Chosen per nudge, in this order:

1. **Fixed template** (always available). Every template contains the reason. Templates are in `src/services/nudges/copy.ts`:
   - `due_soon`: `“<title>” is <reason>.` (for example: “Call Sam” is due at 5:00 pm.)
   - `check_in`: `“<title>” <reason>. A fresh look may help.`
   - `resurface`: `“<title>” <reason>. Want a fresh look?`
2. **AI wording**, only when `ai_features` is on and within `NUDGE_WORDING_TIMEOUT_MS`. It calls `generateNudgeWording` (`ai.md`), which sends only the task title and the reason, never notes, and accepts the text only if it contains the reason and no forbidden phrase. Any failure or timeout uses the template. AI never blocks a nudge.

The title is shown shortened to 80 characters. Titles are the person's own words; a title containing a forbidden phrase is not used at all (section 3.3).

### 5.3 Notification format

The web push payload (encrypted for the browser; the push service cannot read it):

```json
{
  "kind": "nudge",
  "title": "FlowZone",
  "body": "“Call Sam” is due at 5:00 pm.",
  "url": "/tasks/<task id>",
  "taskId": "<task id>",
  "tag": "nudge-<task id>"
}
```

Test notifications use `kind: "test"`, `url: "/settings"`, `taskId: null`, and the body "You asked for this test in Settings. Notifications are working on this device."

The notification's body always includes the reason. On Android, two action buttons appear: **Not today** (snooze this task's nudges) and **Stop for this task** (mute). Other platforms show none, and a tap opens the task.

## 6. Push delivery and devices

- **Keys.** VAPID keys are generated once (`npx web-push generate-vapid-keys`) and set as `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. All three or none. The public key is served by `GET /api/nudges/devices` and is not a secret.
- **Library.** `web-push` 3.6.7 (pinned exactly; version 4.0.0 is too recent to adopt) handles the encryption (RFC 8291) and VAPID signing. This is a library, not a push service.
- **Devices.** One row per browser subscription. Adding the same endpoint again updates the device (`clientRequestId` is `device-<endpoint hash>`).
- **Dead devices.** A push answered `404` or `410` ("gone") removes the device at once. Other failures count up, and the device is removed after `NUDGE_DEVICE_MAX_FAILURES` in a row. A delivered push resets the count.
- **Lifetime.** A push that is not delivered within `NUDGE_PUSH_TTL_SECONDS` (30 minutes) is dropped by the push service.
- **Re-subscription.** When the browser replaces a subscription, the service worker subscribes again and registers the new device (section 7).

## 7. Service worker

`public/sw/modules/push-handler.js`, registered by adding its path to `FLOWZONE_SW_MODULES` in `public/sw/modules/index.js`. Core `public/sw.js` is unchanged. The module handles:

- `push`: shows the notification. Every push shows one.
- `notificationclick`: a tap opens `url` (an in-app relative path). The snooze and mute actions call `PUT /api/nudges/tasks/:id` and open the task if that fails.
- `pushsubscriptionchange`: subscribes again and registers the new device.

It logs nothing and stores no message content.

## 8. Tables

All are user-owned (`userOwnedTable()`), with the standard columns. Schema: `src/server/db/schema/nudges.ts`. Migration: `drizzle/0003_conscious_zombie.sql`.

| Table                 | Columns (besides the standard ones)                                                                                                                                                                                   | Notes                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `nudge_log`           | `kind` (`due_soon`/`check_in`/`resurface`), `task_id` → tasks (set null), `reason_code`, `text`, `wording` (`ai`/`template`), `outcome` (`pending`/`sent`/`failed`/`cancelled`), `local_day`, `decided_at`, `sent_at` | `client_request_id` = `tick-<window>` (once per window). Counts toward the cap while `pending` or `sent`. |
| `nudge_task_controls` | `task_id` → tasks (cascade), `muted`, `snoozed_until`                                                                                                                                                                 | One row per task, only while muted or snoozed. Never changes the task.                                    |
| `push_subscriptions`  | `endpoint`, `p256dh`, `auth_secret`, `label`, `last_success_at`, `failure_count`                                                                                                                                      | Unique per (user, endpoint). Keys are stored as given.                                                    |

## 9. Interface

All UI is in `src/ui/nudges/` and uses the River design system.

- **Settings → notifications** (`notifications-section`, `NotificationsSection`). Hidden unless the `nudges` switch is on, so the permission request is never shown on first load. It states what will happen in one sentence and asks for permission only when the person taps "Allow notifications on this device". It shows the state the browser is in: unsupported, blocked, or on. On iPhone when FlowZone is not on the Home Screen, it shows the install steps (Safari's Share menu, Add to Home Screen; iOS 16.4 or later). It lists the person's devices, marks this one, and offers removal (removing this device also unsubscribes this browser) and a test notification.
- **Task detail** (`task-detail-mute`, `TaskNudgeControl`). Hidden unless nudges are on. One tap to stop nudges for this task, or "Not for 3 days". It says that the task is unchanged.

Copy follows the design-system vocabulary: no "overdue", no guilt, no exclamation marks.

## 10. Data lifecycle

Handler `nudges`, registered in `src/services/lifecycle/registry.ts`.

- **Export:** `nudges/log.json`, `nudges/log.md`, `nudges/task-settings.json`, `nudges/devices.json`. Endpoints and keys are never exported.
- **Deletion:** removes the nudge log, the task controls and the device rows. The server then never sends to those devices. The browser's own subscription remains on the device until the browser or the person removes it; the server cannot revoke it.

## 11. Constants

All in `src/shared/nudge-tuning.ts`. Change them there only.

| Constant                      | Value    | Meaning                                                    |
| ----------------------------- | -------- | ---------------------------------------------------------- |
| `NUDGE_DAILY_CAP`             | 3        | nudges per person per local day (every type)               |
| `NUDGE_TASK_GAP_HOURS`        | 72       | at most one nudge per task in this many hours              |
| `NUDGE_CHECK_IN_GAP_HOURS`    | 72       | at most one check-in (any task) in this many hours         |
| `NUDGE_DUE_SOON_LEAD_MINUTES` | 180      | a timed task is nudged this many minutes ahead of its time |
| `NUDGE_SNOOZE_DAYS`           | 3        | length of "Not for 3 days"                                 |
| `NUDGE_TICK_WINDOW_MINUTES`   | 30       | the scheduler's window; calls in one window are no-ops     |
| `NUDGE_PUSH_TTL_SECONDS`      | 1800     | undelivered pushes are dropped after this                  |
| `NUDGE_WORDING_TIMEOUT_MS`    | 4000     | AI wording waits this long, then the template is used      |
| `NUDGE_DEVICE_MAX_FAILURES`   | 5        | failed sends in a row before a device is removed           |
| `NUDGE_NOTIFICATION_TITLE`    | FlowZone | the notification title                                     |

Quiet hours are the person's own setting (`api.md`, section 9: default 21:00 to 08:00).

## 12. Environment and secrets

Documented in `.env.example`, section "Nudges and web push". Startup checks are in `src/server/env.ts`.

| Name                | Where                            | Notes                                                                                      |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `NUDGE_TICK_SECRET` | app env (Vercel), GitHub secret  | at least 32 characters; unset disables the tick endpoint                                   |
| `VAPID_PUBLIC_KEY`  | app env (Vercel)                 | public; all three VAPID values or none                                                     |
| `VAPID_PRIVATE_KEY` | app env (Vercel)                 | secret                                                                                     |
| `VAPID_SUBJECT`     | app env (Vercel)                 | `mailto:` or `https://` contact address for the push services; use the owner's own address |
| `NUDGE_TEST_CLOCK`  | local and test environments only | refused in production (startup and per request); never on Vercel                           |
| `FLOWZONE_APP_URL`  | GitHub repository **variable**   | the production address, no trailing slash                                                  |

## 13. Known limits

- **Timing drift.** Scheduled runs can be delayed, so a nudge may come late in its window. Nudges are about when, not exact.
- **Shared devices.** Two people on one browser share the browser's push subscription. The device list is per account, so both accounts may receive the same device's notifications until one removes it. Owner decision: see the handoff.
- **Lock screens.** The task title appears in the notification text. It is encrypted in transit, but it is visible on a locked phone's screen.
- **Concurrent runs.** A manual run and a scheduled run for the same person in the same window are serialised by the window reservation. Two different windows running at the same moment could briefly overshoot the cap by one; a re-count after the reservation limits this, but it is not a database lock (the pooled connection cannot hold one).
- **iPhone.** Push works only for an installed (Home Screen) app on iOS 16.4 or later. Whether installing from Chrome works is unverified (see the handoff note).
- **GitHub schedules.** GitHub's Enterprise Server documentation says scheduled workflows in a public repository are disabled after 60 days without repository activity. The github.com pages checked for this build did not confirm that rule, so the owner must check it on the real repository. This repository's visibility decides which free-minute allowance applies.
