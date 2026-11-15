# Handoff 06: Nudges and push

Agent 6 (Nudges). Contract: [`docs/contracts/nudges.md`](../contracts/nudges.md). Read it first; this note records status, the setup the owner must do, and what is still unverified.

## 1. Status at a glance

| Area | State |
| --- | --- |
| Nudge engine, rules, caps, quiet hours, gaps, mute and snooze | Built and verified locally (section 4) |
| Tick endpoint and its security, test-only clock | Built and verified locally. **Blocked for the scheduler**: see section 2 |
| GitHub Actions schedule | Workflow written. Not run against Vercel. Needs the owner's secrets (section 3) |
| Web push delivery, dead-device removal | Built and verified against a local push stub. **Not verified on any real browser or phone** |
| Service worker push module | Built. Runs in the service worker only on a real push, so not exercised in this run |
| Settings: notifications section | Built and checked in a browser (headless Chromium) |
| Task detail: mute and snooze | Built and checked in a browser, including one real tap each way |
| iPhone install guidance | Built and checked by reading the logic in a browser. **Not tested on a real iPhone** |
| Data export and deletion | Handler registered. Export and deletion not yet run end to end |
| Contract and this note | Written |

Nothing is committed. The work is in the working tree alongside the other agents' uncommitted files.

## 2. Blocker: the scheduler cannot reach the tick endpoint

`src/proxy.ts` (Foundation) answers any `/api/*` request that has no session cookie with `401 unauthenticated`, before any route runs. Its public list is `/sign-in`, `/api/auth`, `/api/health`. The scheduler sends no cookie, so **every scheduled call fails at the proxy** until `/api/nudges/tick` is added to that list.

I did not make that change: `proxy.ts` belongs to Foundation, and the brief says to raise blockers rather than edit other agents' code. The change is one line in `PUBLIC_PATHS`. The tick is still protected by its own secret check and does not return any user data. Owner or Foundation to decide.

Verification worked around this by sending the tick with a real session cookie. The proxy only checks that a cookie exists, and the route then runs its own secret check, so the engine ran in full. This is not the scheduler's path.

## 3. Owner setup

**Repository secrets and variables** (GitHub: Settings → Secrets and variables → Actions):

- Secret `NUDGE_TICK_SECRET`: the same value as in the app's environment. At least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- Variable `FLOWZONE_APP_URL`: the production address, for example `https://your-domain`, with no trailing slash.

**Vercel environment variables** (Production; Preview only if you want to test there):

- `NUDGE_TICK_SECRET`: the same value as the GitHub secret.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: generate once with `npx web-push generate-vapid-keys`. Set all three VAPID values or none.
- `VAPID_SUBJECT`: a contact address for the push services, `mailto:your-address` or an `https://` URL. **Use your own address.** It is sent to the browser vendors' push services in each push's signature.
- Do **not** set `NUDGE_TEST_CLOCK` on Vercel. The app refuses to start if it is set in production.

Keep the values out of the repository and out of chat. Only `.env.example` is committed, and it contains no values.

**Scheduler facts (verify on the real repository):**

- The workflow runs every 30 minutes (`*/30 * * * *`) and on manual trigger. GitHub may delay scheduled runs.
- Free minutes: I could not read the exact figure from GitHub's pages. The billing page states the free allowance as a dollar amount ($12 of included usage for the Free plan). At the Linux 2-core rate of $0.006 per minute, that is about 2,000 minutes a month. This is my arithmetic, not a stated figure. At one run every 30 minutes, the schedule uses about 1,460 runs a month. Each run may bill as one whole minute, so it fits, with little headroom for manual runs. Check the Actions usage page after a week.
- The 60-day rule: GitHub's Enterprise Server documentation says scheduled workflows in a public repository are disabled after 60 days without repository activity. I did not confirm that on the github.com pages. Check it for this repository. If the repo is public and idle, the schedule may need a manual re-enable.

## 4. What was verified, and how

Verification ran against the local Postgres 17 container (`flowzone-pg-verify`), the production build, and a local HTTPS stub that behaves like a push service: 201 for delivery, 410 for a dead subscription, 500 for a failure. The stub trusts a self-signed certificate through `NODE_EXTRA_CA_CERTS`, for that process only. Push payloads were really encrypted and VAPID-signed. The stub logged only path, status and sizes.

Results:

- **Quiet hours:** a tick at 22:30 Paris time returned `quiet_hours`.
- **Cap of three per day:** the first three nudges went out in three windows; the fourth returned `daily_cap`.
- **Per-task gap:** the task already nudged in the same day was passed over for the next task.
- **Idempotency:** the same window called twice sent once; the second call returned `already_handled`.
- **Dead device:** a push answered 410 removed that device at once; the live device still received its nudge.
- **Failed send:** a 500 logged the nudge as `failed`, raised the device's failure count to 1, and did not use up the day's cap.
- **Mute and snooze:** the muted task and the snoozed task were both passed over; the next task was chosen. Snooze set `snoozedUntil` three days ahead. The task row was unchanged.
- **Nudges switch off:** the engine returned `nudges_off`.
- **Secret:** missing and wrong secrets both returned `401`.
- **Test-only clock:** with `NUDGE_TEST_CLOCK` unset, `?asOf=` returned `404` and a normal tick still worked. With `APP_ENV=production` and the flag set, the app refused to start and named `NUDGE_TEST_CLOCK`.
- **Test notification:** delivered to the live device.
- **Reason in every nudge:** the stored texts were, for example, "“Call Sam” is due at 4:00 pm." (16:00 Paris), "“Renew passport” is due at 4:00 pm.", and so on. Each one contains its reason.
- **Settings and task pages in a browser:** the notifications section appeared when the switch was on, with its heading, one sentence, the allow button and the device list. The task control showed its copy, both buttons were at least 44 px tall, and a tap to mute and a tap to restore both worked. The console showed no errors.
- **Build, typecheck, lint:** all pass. The build's only warning is an existing font-override notice from Frontend Core.

The database rows and the stub's log were checked directly, not inferred from the API responses.

## 5. Not verified

- **Real push on Android Chrome and Windows Chrome.** Needs the owner's devices, a deployed app, and the Vercel keys. The stub proves the server side only.
- **iPhone.** Not tested on a real device. Two open questions:
  - Whether the notification permission and subscription work once FlowZone is installed from Safari. The guidance tells people to use Safari, as the brief asks.
  - Whether installing from Chrome on iOS works at all. Not tested.
  - iOS 16.4 or later is required.
- **The Android notification action buttons** ("Not today", "Stop for this task") and whether a tap on them changes the nudge settings on a real device.
- **The service worker's `pushsubscriptionchange` path.** Not exercised.
- **Export and account deletion** with the new handler, end to end.

## 6. Draft real-device checklist (for QA & Docs)

1. Turn **Nudges** on in Settings. The notifications section appears; nothing asks for permission before that.
2. Tap **Allow notifications on this device**. The browser asks once; allow. The device appears in "Your devices" with a sensible label.
3. Tap **Send a test notification**. It arrives. Its text says it was asked for in Settings.
4. Tap the test notification. The app opens at Settings.
5. Create a task due today with a time in the next two hours. At the next tick, a nudge arrives with the reason ("is due at …"). Tapping it opens the task.
6. On Android: long-press or expand the nudge and tap **Not today**. Reopen the task: the control says nudges are paused. Repeat with **Stop for this task**.
7. On the task page, tap **Stop nudges for this task**, then **Turn nudges back on**. Confirm the task itself is unchanged.
8. Remove this device from the list. Confirm that a later test notification does not arrive on it and that the browser's own subscription is gone.
9. iPhone (once installed from Safari): repeat steps 1–5. Record the result, and separately whether installing from Chrome works.
10. Switch Nudges off. Confirm no nudge arrives, even at a due time.

## 7. Known limits

- **Timing drift.** Scheduled runs can be delayed. Nudges are about when, not exact.
- **Shared browsers.** Two accounts on one browser share one push subscription. The server keeps the device per account, so both accounts can receive that device's notifications until one of them removes the device. See the owner decisions below.
- **Lock screens.** The task title is in the notification text. It is encrypted in transit, but visible on a locked phone.
- **Cap race.** Two different tick windows running at the same moment could overshoot the cap by one. The cap is re-counted after the window is reserved, which limits this, but there is no database lock, because the pooled connection cannot hold one.
- **Subscription removal.** Deleting an account removes the server's rows. It cannot revoke the browser's subscription; the server simply stops sending to it.
- **AI wording** was not exercised, because no AI provider is configured here. The template path is what ran.

## 8. Decisions for the owner

1. **Proxy:** approve adding `/api/nudges/tick` to `PUBLIC_PATHS` in `src/proxy.ts`, or have Foundation do it. Nothing scheduled works without it.
2. **Task title on the lock screen.** The notification shows the task title. The alternative is a generic line ("A task needs a look"), which is more private but less useful. Current choice: show the title.
3. **Shared browsers.** Options: accept it for two trusted people; or have the app unsubscribe the browser on sign-out (this needs a change to Frontend Core's sign-out, so it is not done here).
4. **`VAPID_SUBJECT`.** Use the owner's own contact address on Vercel. The placeholder in `.env.example` is only a placeholder.
5. **Nudge tuning.** All values are in `src/shared/nudge-tuning.ts`, with the defaults from the brief: cap 3, gap 72 hours, check-in gap 72 hours, due-soon lead 180 minutes, snooze 3 days. Owner to confirm.
6. **Due-today without a time.** These tasks are nudged once, at the first non-quiet window of the day, and not again for 72 hours. This could feel frequent for someone with many undated due-today tasks. The cap of three per day limits it. Owner to confirm.

## 9. Environment variables added

Schema and validation in `src/server/env.ts`; documented in `.env.example`:

- `NUDGE_TICK_SECRET`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `NUDGE_TEST_CLOCK` (test environments only)

Repository: variable `FLOWZONE_APP_URL`; secret `NUDGE_TICK_SECRET`.

## 10. Files

- Contract: `docs/contracts/nudges.md`
- Constants: `src/shared/nudge-tuning.ts`; shared types and schemas: `src/shared/nudges.ts`
- Tables: `src/server/db/schema/nudges.ts`; migration `drizzle/0003_conscious_zombie.sql`
- Engine and rules: `src/services/nudges/` (`policy.ts`, `candidates.ts`, `copy.ts`, `engine.ts`, `tick.ts`, `delivery.ts`, `devices.ts`, `controls.ts`, `lifecycle.ts`)
- Push: `src/server/push/web-push.ts` (the `web-push` library, pinned to 3.6.7)
- Routes: `src/app/api/nudges/` (tick, devices, devices/[id], test, tasks/[id])
- Interface: `src/ui/nudges/` (notifications section, task control, platform helpers, API calls); fills `notifications-section` in `src/ui/settings/settings-screen.tsx` and `task-detail-mute` in `src/ui/tasks/task-screen.tsx`
- Service worker: `public/sw/modules/push-handler.js`, registered in `public/sw/modules/index.js`
- Scheduler: `.github/workflows/nudges-tick.yml`
- Lifecycle: registered in `src/services/lifecycle/registry.ts`

## 11. Changes outside my own files

- `src/server/env.ts`: new variables (the Foundation convention allows this).
- `src/services/lifecycle/registry.ts`: one import and one list entry (the documented registration step).
- `src/ui/settings/settings-screen.tsx` and `src/ui/tasks/task-screen.tsx`: one slot filled in each (the documented extension points).
- `public/sw/modules/index.js`: one path added to the documented array. `public/sw.js` is unchanged.
- `package.json` and `package-lock.json`: `web-push` 3.6.7 and `@types/web-push` 3.6.4, both pinned exactly. Version 4.0.0 of `web-push` was published eight days before this work and was not adopted.
- `.env.example`: a new section.

No change was made to `src/proxy.ts` (see section 2).
