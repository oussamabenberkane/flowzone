# Handoff 03: Frontend Core

Status: **built and verified locally** in a production build, against a local Postgres 17 and the Backend API. Typecheck, lint, Prettier and `next build` pass for the Frontend Core files. **Nothing is committed.** The work is in the working tree on branch `backend-core-api`, on top of the Backend commit `4aae4f6`. Not pushed. Not tested on Neon, Vercel or real phones (see section 9).

Next readers:

- **Frontend AI:** start with [`docs/contracts/design-system.md`](../contracts/design-system.md), then section 4 below.
- **Nudges:** section 4.3 (the push hook) and the `notifications-section` and `task-detail-mute` slots.
- **QA & Docs:** section 6 (test hooks) and section 9 (what is not verified).

Contents: [1 What was built](#1-what-was-built) · [2 Run it](#2-run-it) · [3 Libraries and dependencies](#3-libraries-and-dependencies) · [4 Extension points](#4-extension-points) · [5 Offline](#5-offline) · [6 Test hooks](#6-test-hooks) · [7 Decisions for the owner](#7-decisions-for-the-owner) · [8 Verification record](#8-verification-record) · [9 Known limitations and not verified](#9-known-limitations-and-not-verified) · [10 Shared working tree (important)](#10-shared-working-tree-important) · [11 Acceptance checklist](#11-acceptance-checklist)

---

## 1. What was built

**Shell and navigation.** Top bar with the always-available **Capture** button and the persistent `global-assistant` area. Bottom bar on phones, side rail on screens 60 rem and wider. Five items: Today, Inbox, Projects, Notes, Settings. Skip link. Offline and sync line under the top bar.

**Screens** (all working against the real API):

| Route | Screen |
| --- | --- |
| `/today` | Today: the plan, the once-a-day plan prompt, the eddy (fresh look), the evening reflection, read-only copy when offline |
| `/inbox` | Inbox with "Show more" paging |
| `/projects`, `/projects/[id]` | project list, add, rename, remove (tasks keep their data), a project's open tasks |
| `/tasks/[id]` | task detail: title, project, date, time, priority, energy, estimate, repeat (with pause), steps, notes, "Other options" (reschedule, break down, snooze, let go), delete |
| `/focus/[id]` | Focus: one leaf, the current step, next step, an optional timer (off until started), park a thought |
| `/notes`, `/notes/new`, `/notes/[id]` | notes and journal: one entry model, two entry points with different framing |
| `/settings` | **stub**: look-and-feel controls, time zone, the two extension sections, sign out |
| `/sign-in` | restyled; behaviour unchanged from Foundation |
| `/` | redirects to `/today` |

**Quick add (Capture).** A sheet. Plain text goes to `POST /api/quick-add/parse`, the result is shown as "What I understood", and every field can be corrected. Saving creates the task with a client request id. A project named in the text that does not exist is created with a derived, retry-safe id.

**Design system.** Tokens in `src/app/globals.css`, light and dark (follows the system), the River components in `src/ui/`. The contract is `docs/contracts/design-system.md`.

**Accessibility.** Reduced motion honoured always; an in-app "Less motion" choice; text size (Standard, Larger, Largest) that scales every rem size; a dyslexia-friendly font (Lexend body text, wider spacing). The choices are applied before first paint. Keyboard focus is always visible; sheets are native dialogs; live regions for toasts and status.

**PWA.** Web manifest (`src/app/manifest.ts`), icons in `public/icons/` (192, 512, maskable 512, Apple 180), generated from one design (`src/app/icon.svg`). Service worker `public/sw.js` (production only). Installable in principle; **not tested on a device** (section 9).

**Plan my day.** Shown once a day on the device, until a plan is confirmed or the prompt is dismissed. It shows up to five rules-based suggestions and an energy choice. Nothing is applied until the person confirms.

**Focus.** Timer off until started, counting down from the estimate or 25 minutes. Park a thought saves a note linked to the task. Completion is quiet: "Done.", with "Next:" for the next step. No points, streaks or counters.

**Falling behind.** No red anywhere. The eddy card and the repeat prompt ("This one has been quiet for a while. Adjust it or pause it?") use calm words. "Overdue" is not used.

**Sign out.** Removes this device's copies (captures not yet sent, the saved Today, cached pages). If captures are waiting, it asks first.

**Files, by folder.** `src/app/` (routes, layout, globals.css, manifest, icon), `src/app/(app)/` (signed-in routes and the auth gate), `src/ui/` (components and logic: `api/`, `data/`, `offline/`, `shell/`, `today/`, `tasks/`, `focus/`, `notes/`, `projects/`, `inbox/`, `fresh-look/`, `a11y/`, `extensions/`, `pwa/`, `settings/`), `public/sw.js`, `public/sw/modules/index.js`, `docs/contracts/design-system.md`.

## 2. Run it

Prerequisites as in the Backend note (a development database in `DATABASE_URL`, `npm install`).

```
npm run db:migrate                      # applies every migration in drizzle/
npm run script -- scripts/seed.ts       # sample data for the first two ALLOWED_EMAILS
npm run build && npm start              # the service worker only registers in production builds
```

Development (`npm run dev`) works, but the service worker is off there by design, so offline behaviour needs the production build.

Test sign-in: `POST /api/auth/test-login` with `{ "user": "alice" }` (from a page on the same origin, see Foundation section 9).

**No new environment variables.** No new dependencies (section 3).

## 3. Libraries and dependencies

**No npm dependency was added.** Justification for keeping it that way:

- **Data fetching:** a small keyed cache in `src/ui/data/query.ts` (stale-while-revalidate, optimistic updates, `useSyncExternalStore`). It replaces a library. A personal app holds a few hundred entries.
- **Offline storage:** a thin wrapper over IndexedDB (`src/ui/offline/db.ts`).
- **Dialogs:** native `<dialog>` with `showModal()`.
- **Icons:** inline SVG (`src/ui/icons.tsx`).
- **Fonts:** `next/font/google` (Newsreader, Atkinson Hyperlegible Next, Lexend), self-hosted at build time, so the browser makes no request to Google.
- **Icons (PNG):** rendered once with the Windows GDI+ APIs from the same geometry as the SVG. The render script is not in the repo; the output is committed.

## 4. Extension points

### 4.1 Slots

`<ExtensionSlot name="…" fallback={…}>{children}</ExtensionSlot>` in `src/ui/extensions/slots.tsx`. Children replace the fallback when given. The wrapper is `display: contents`. The table of all nine slots, where they render and what their manual fallback is, is in the design-system contract, section 8.

| Slot | Rendered in | Current state |
| --- | --- | --- |
| `global-assistant` | top bar | rendered empty (reserved) |
| `plan-day-proposal` | plan sheet | rendered empty; rules list is the fallback |
| `task-assist` | Today, Focus, task detail | rendered empty |
| `quick-add-assist` | **not yet rendered** in the quick-add sheet | Frontend AI adds it next to "What I understood" |
| `fresh-look-assist` | fresh-look sheet, above the options | rendered empty |
| `reflection-prompt` | reflection card | plain wording is the fallback |
| `settings-sections` | Settings | rendered empty |
| `notifications-section` | Settings | rendered empty (Nudges fills it) |
| `task-detail-mute` | task detail | rendered empty (Nudges fills it) |

### 4.2 Accessibility controls (embeddable)

`AccessibilityControls` in `src/ui/a11y/controls.tsx` bundles text size, the dyslexia font and less motion. They are already placed in the stub Settings page (so the mechanisms are reachable now). Frontend AI may move them, but keep them together.

### 4.3 Service worker push hook (for Nudges)

`public/sw.js` has no push code. To add behaviour:

1. Put a classic script in `public/sw/modules/`, for example `push-handler.js`. It adds its own listeners at top level.
2. Add its path to the `FLOWZONE_SW_MODULES` array in `public/sw/modules/index.js`.

`sw.js` does not change. Modules run in the worker and cannot use the DOM or import app code.

### 4.4 Sign-out contract

`SignOutButton` (`src/ui/sign-out-button.tsx`) is the only place that clears device data. If a new feature stores per-person data on the device, it must be cleared there too.

## 5. Offline

- **Capture offline.** `saveCapture` keeps the task in IndexedDB, tagged with the person's user id. When the connection returns (or on load), `flushCaptures` sends each one with its client request id. A retry cannot create a second task. Verified: an offline capture reached the server exactly once after a double `online` event.
- **Owner guard.** A device can hold captures from several accounts over time. A capture is only sent with the session of the account that made it. This protects against sending one person's task with another person's session.
- **Refusals.** A capture the server refuses stays on the device, with a calm message and "Try again" / "Discard this one" in the sync line. It is never dropped silently.
- **Cached Today.** Every successful Today load is saved to the device. When the network is gone, Today opens from that copy, read-only, with the time it was saved (device time zone). Completing a task is disabled there.
- **Service worker.** App pages are network-first with a 3 s timeout and a saved copy as fallback. Built assets are cache-first. `/api/*` is never cached by the worker. Sign-out asks the worker to clear the page cache. An inline offline page is served for pages never visited.
- **New notes and journal entries** written offline are kept on the device the same way: tagged with the owner, sent with their own request id on reconnect, and removed only after the server answers. Verified: an offline journal entry reached the server once and the queue emptied.
- **Editing** an existing task or entry still needs a connection. The screens say so and keep the words typed.

## 6. Test hooks

The full table is in the design-system contract, section 9. Key points for QA:

- **One navigation.** `nav.fz-nav` holds the five links once: a fixed bottom bar on phones, a side rail on wide screens. Test hooks `nav-today`, `nav-inbox`, and so on are unique.
- Use `data-testid` for the hooks listed in section 9 of the design contract, and roles and names otherwise.
- Every extension slot exposes `data-slot="<name>"` and `data-filled="true|false"`.

## 7. Decisions for the owner

I chose these where the brief left room. Each is a single change.

1. **Dated tasks stay in the Inbox** (the Backend's open decision, carried through). The quick-add sheet says "It will be in your Inbox" for a dated task, to match the API. If the answer changes, change `listTasks` and that sentence.
2. **Reflection starts at 19:00 on the device's clock** (`REFLECTION_START_HOUR` in `src/ui/today/reflection-card.tsx`). It is in-app only, skippable for the day, and hidden once a journal entry exists for today.
3. **Plan prompt: once a day per device**, until a plan is confirmed or dismissed. The prompt never blocks.
4. **Focus timer defaults to 25 minutes** when the task has no estimate. It is off until started.
5. **Drop has no undo** (the API has none). The sheet says it stays in the export.
6. **Settings stub holds the accessibility controls.** The brief gives them to Frontend AI to place; they are here so the mechanisms are reachable before Frontend AI lands.
7. **Energy is a device choice**, set in the plan sheet, and used only for suggestions.
8. **Time zone** is set from the device on first run (Foundation step 4.9). The Settings stub shows it.
9. **Sign-out with captures waiting** asks first, and removes them if confirmed.

## 8. Verification record

Everything below ran on this machine. Production build (`next build`, `next start`) on port 3200, against a throwaway Postgres 17 container (removed afterwards), with the test accounts `alice` and `bob`. The allow-list and auth URL were overridden for that server process only, not in any file.

**Gates** (Frontend Core paths):

| Gate | Result |
| --- | --- |
| `eslint` on `src/ui`, `src/app/(app)`, the root layout and page, sign-in and manifest | no problems |
| `tsc --noEmit` | no errors in Frontend Core files |
| `prettier --check` (applied with `--write` to the Frontend Core files) | formatted |
| `npm run build` | passes; every route compiles (the Atkinson fallback-metrics warning remains, see section 9) |

**Browser checks** (Playwright, Chromium):

| Check | Viewport / theme | Result |
| --- | --- | --- |
| Today from real data (plan, eddy, prompt), no console errors | phone 390×844, light | pass (screenshot reviewed) |
| Today, desktop with rail | 1280×860, dark | pass (screenshot reviewed) |
| Task detail (fields, repeat, steps, notes, options) | phone, dark | pass (screenshot reviewed) |
| Focus: timer starts, counts down; park a thought saves and confirms | phone, dark | pass |
| Capture: parse shows "What I understood", task saved to the project | phone | pass |
| Capture without date/project lands in Inbox; completing it shows "Done." with Undo | desktop | pass |
| Plan sheet: suggestions with reasons, nothing applied until confirm | phone | pass |
| Notes list, new journal entry (framing and save) | phone | pass |
| Settings: text size, dyslexia font, persistence across reload before first paint | phone | pass |
| Sign-out clears the session and lands on sign-in | phone | pass |
| Sign-in page | phone, light | pass (screenshot reviewed) |
| Keyboard: Tab reaches Capture (after skip link and wordmark) with a visible focus ring; Enter opens; Escape closes and returns focus | desktop | pass |
| Focus lands in the Capture text field on open | phone | pass (after fix) |
| Reduced motion (system setting emulated): all durations become 0 | light | pass |
| Offline (simulated, see section 9): a capture is kept on the device, sent once on reconnect, the sync line clears | phone | pass |
| Offline (simulated): Today opens from the saved copy, read-only, with the local time; plan leaves disabled | phone | pass |
| Manifest served; three icons 200 `image/png`; service worker registered | production | pass |
| Contrast, all text pairs in both themes (computed from tokens) | both | all at least 4.55:1 |

**Fixes made during verification:** the Focus step label copy; the quick-add "(from ...)" source shown only when there is text; a missing focus on sheet open; hint text rendered bold (a selector bug); the offline Today time shown in UTC (now device time); plan leaves still clickable while offline (now disabled); a cross-account risk for offline captures (now tagged with their owner and sent only with that owner's session).

**Follow-up pass (known issues):**

| Item | Change | Verified |
| --- | --- | --- |
| Plan rows crowded on narrow phones | row controls move to their own line under 30 rem (`.fz-task-actions`) | phone 390×844: titles at full width, controls below |
| Navigation duplicated in the DOM | one `nav.fz-nav`: bottom bar on phones, rail on wide screens | exactly one `nav-today` element; rail and bar both render correctly |
| Notes and journal not queued offline | a new entry written offline joins the capture queue (owner-tagged, same request id) | offline journal entry queued, sent once, queue emptied |
| Retry could duplicate a task or entry | an offline fallback reuses the request id of the failed attempt | by construction; the server returns the existing row for a repeated id |
| Atkinson build warning | not fixable by setting (boolean only); explained in section 9 | warning still printed; build passes |

**Backend observation** (not changed, since it is the Backend's file): `POST /api/quick-add/parse` returns an empty `text` in `understood` for the time field (for example `{"field":"dueTime","value":"17:00","text":""}`). The UI now hides the empty source. Worth a note to the Backend owner.

## 9. Known limitations and not verified

**Not verified:**

- **Real offline on a device.** Offline was simulated in the page (`navigator.onLine` and failing `/api` requests). The service worker registration and the manifest were checked, but the app shell was **not** reloaded with the network actually off. Test this on a phone.
- **Real devices and browsers.** Only desktop Chromium and a 390×844 emulated viewport were used. Not tested: Chrome on iPhone, Android Chrome, Windows Chrome. Not tested: installation prompt, standalone display, safe-area insets on a notched phone.
- **Keyboard-only through every screen.** Checked the Capture path only.
- **Neon and Vercel.** The app ran against local Postgres only (inherited from the Backend and Foundation notes).
- **Automated tests.** None written (the QA & Docs agent owns them).

**Known limitations:**

- **Larger text and the dyslexia font on Today rows are not checked.** Both were applied on the Settings page only; a phone check of the Today and task rows at "Largest" is still needed.
- **Search** has no screen (it is not in this agent's list). The endpoint exists.
- **`quick-add-assist`** is declared but not rendered in the quick-add sheet yet (Frontend AI).
- **`global-assistant`** is a reserved area in the top bar, empty.
- **Atkinson fallback warning.** `next build` reports "Failed to find font override values for font `Atkinson Hyperlegible Next`". It is a build-time notice. Next's source logs it whenever it has no fallback metrics for a Google font family (the lookup fails inside `get-fallback-font-override-metrics`). `adjustFontFallback` accepts only a boolean in this Next version, so it cannot be silenced by a setting. Nothing renders wrong. The real fix is a font with known metrics, or a Next release that includes this family.
- **Sign-out with captures** removes them if the person confirms. The sign-in screen cannot tell people about captures from another account on the same device; those stay on the device, unsent, until that account signs in again or the device's data is cleared.
- **Relative times are not shown.** Dates are "Today", "Tomorrow", "Wed 11 Nov". The server is the source for "today".
- **The Inbox page size** is 50 per page, with "Show more". The Projects screen shows the first 200 open tasks only.
- **Focus leaf** size is `min(70vw, 14rem)`. The top bar may overlap it in a full-page screenshot (sticky header), which is an artifact of the capture, not seen in the viewport.
- **Dark mode** has no in-app switch (the brief asks for system-following). `data-theme="dark"` exists as a hook only.

## 10. Shared working tree (important)

While this work was in progress, **files for the AI agent appeared in the same working tree and branch** (`backend-core-api`): `src/server/ai/`, `src/services/ai/`, `src/shared/ai*.ts`, `src/app/api/ai/`, `src/server/db/schema/ai.ts`, `drizzle/0002_ai_tables.sql`, `scripts/ai-verify.ts`, and modified `.env.example`, `src/server/env.ts`, `drizzle/meta/_journal.json` and `package-lock.json`. The AI agent is supposed to use its own branch or worktree (`agents/execution.md`).

Effects on this work:

- Two `next build` attempts failed on the AI agent's files while they were being edited (a stray double comma in `src/services/ai/features.ts` and `profile.ts`, and a `scripts/live-check2.ts` that came and went). The build passed on the next attempt, after the AI agent's edits settled.
- I did not edit any of those files.
- The Frontend Core changes are **only** in the paths listed in section 1 and in `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/sign-in/page.tsx`, `src/ui/sign-in-panel.tsx` and `src/ui/sign-out-button.tsx` (the Foundation placeholders this agent replaced, as the brief asks).

**Decision for the owner:** separate the work into branches or worktrees before committing, so the Frontend Core commit does not include the AI agent's files. I have not committed anything.

## 11. Acceptance checklist

| # | Deliverable (brief section 7) | Status |
| --- | --- | --- |
| 1 | Design system and `design-system.md` (tokens, themes, components, motion, tone, all nine extension points) | Done. Contrast measured. |
| 2 | App shell, navigation, all listed screens working against the real API; capture, organize, plan, focus, complete, review, notes and journal, projects, with no AI | Done for the paths in section 8. Not every screen was exercised by a click; see section 9. |
| 3 | Offline capture and cached Today (captured offline appears once; Today from cache) | Verified by simulation (section 8). **Real network-off not verified.** |
| 4 | Fresh-look and falling-behind experience (no red, no "overdue", actions work) | Done. The fresh-look actions were not all clicked (drop and break-down not exercised). |
| 5 | Plan-my-day prompt (rules-based), Focus with optional timer and park-a-thought, quiet completion | Done and checked (plan sheet, timer, park, completion). |
| 6 | Accessibility baseline (keyboard use, reduced motion, contrast, screen-reader labels, dyslexia font and text scale) | Mechanisms done; reduced motion, contrast, dyslexia font and text scale verified; keyboard checked on Capture only. |
| 7 | PWA installability (Android and desktop Chrome; manifest and icons valid) | Manifest and icons valid in production; **installation not tested on a device**. |
| 8 | `docs/handoff/03-frontend-core.md` | this note |

**Definition of done:** build, type check and lint pass for the Frontend Core files. Verification recorded above. No TODO comments in the new code. The open items are in sections 9 and 10.
