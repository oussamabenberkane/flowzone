# Design system contract

Owner: the Frontend Core agent (Agent 3). **Read-only for everyone else.** Others read this document and do not change it. If something here blocks you, write the problem in your handoff note.

This is the contract for the River design system: its tokens, themes, components, motion and copy rules, accessibility mechanisms, and the extension points that later features plug into. The code is in `src/app/globals.css` (tokens), `src/ui/` (components) and `public/sw.js` (the service worker). Where the two disagree, that is a bug to report.

Read first: [`api.md`](api.md) for the data, [`foundation.md`](foundation.md) for the conventions.

Contents: [1 Concept](#1-concept) · [2 Tokens](#2-tokens) · [3 Themes and contrast](#3-themes-and-contrast) · [4 Accessibility](#4-accessibility) · [5 Components](#5-components) · [6 Motion](#6-motion) · [7 Copy and tone](#7-copy-and-tone) · [8 Extension points](#8-extension-points) · [9 Test hooks](#9-test-hooks) · [10 Layout and navigation](#10-layout-and-navigation)

---

## 1. Concept

**The River.** A task is a leaf on calm water. Today is the stretch of water in front of you. A task that needs a fresh look drifts into a quiet eddy. Focus narrows to one leaf. A finished task becomes a pebble.

The story lives only in shape, colour, motion and words. It never adds a step, a screen or a counter.

Design choices, and why they are not the defaults:

- **Palette.** Cool mist paper, deep teal ink, teal for actions, moss for living leaves, sand pebble for the eddy and for done things. Not cream and terracotta, and not near-black with an acid accent.
- **Type.** Newsreader for headings only. Atkinson Hyperlegible Next for everything else, chosen for legibility. Lexend is the optional dyslexia-friendly body face.
- **Structure.** Tasks are marked by leaves, not bullets or numbers. The eddy is a tinted pocket, not a bordered card. No uppercase eyebrows, no middle-dot strings, no arrows in buttons, no red anywhere.
- **One motion moment.** A completed leaf drifts off the list. Everything else is still, or changes in place.

## 2. Tokens

Tokens are CSS custom properties on `:root` in `src/app/globals.css`. Components use tokens only. A value is never hard-coded in a component (the few exceptions are the Focus leaf and the offline page, which must work before CSS loads).

### 2.1 Colour (light, default)

| Token              | Value                              | Use                                          |
| ------------------ | ---------------------------------- | -------------------------------------------- |
| `--paper`          | `#edf2ee`                          | page background (the shallows)               |
| `--surface`        | `#f8fbf8`                          | cards, fields, sheets, bottom bar            |
| `--eddy`           | `#e7e1d0`                          | the eddy and secondary buttons (pebble sand) |
| `--ink`            | `#17292b`                          | main text                                    |
| `--ink-soft`       | `#3f5657`                          | secondary text                               |
| `--river`          | `#1f6266`                          | primary action, links, selection             |
| `--river-contrast` | `#ffffff`                          | text on `--river`                            |
| `--river-wash`     | `#d3e5e2`                          | hover and current-item background            |
| `--moss`           | `#3f7046`                          | live leaves, the leaf vein                   |
| `--pebble`         | `#8a6f3e`                          | done pebbles, the task note line             |
| `--line`           | `#bfcbc6`                          | field borders and hairlines                  |
| `--focus`          | `#0b4f7a`                          | keyboard focus ring                          |
| `--scrim`          | `rgb(14 28 30 / 0.42)`             | behind sheets                                |
| `--shadow-sheet`   | `0 18px 48px rgb(14 28 30 / 0.22)` | the one shadow: sheets and toasts            |

### 2.2 Type

| Token                      | Value                                                     | Use                                   |
| -------------------------- | --------------------------------------------------------- | ------------------------------------- |
| `--font-display`           | Newsreader (`--font-newsreader`)                          | h1, h2 headings and the focus step    |
| `--font-body`              | Atkinson Hyperlegible Next (`--font-atkinson`)            | everything else                       |
| `--font-body` (dyslexia)   | Lexend (`--font-lexend`)                                  | when the dyslexia-friendly font is on |
| `--text-xs` … `--text-3xl` | 0.8125 · 0.9375 · 1.0625 · 1.1875 · 1.4 · 1.75 · 2.25 rem | scale (base body 1.0625 rem)          |
| `--leading-body`           | 1.55 (1.7 in dyslexia mode)                               | body line height                      |
| `--leading-heading`        | 1.2                                                       | headings                              |

All sizes are `rem`, so the browser's text size and the in-app text size scale everything. Headings use the display face at weight 500. Labels are sentence case.

### 2.3 Space, shape, touch, layout

- Spacing on a 4 px base: `--space-1` (4 px) to `--space-12` (48 px). Only these values are used.
- Radius: `--radius-sm` 10 px (fields), `--radius` 16 px (rows, notices), `--radius-lg` 24 px (cards, sheets), `--radius-pill` (buttons, choices, leaves' hit areas).
- `--touch` 44 px: no tap target is smaller.
- Layout: `--content-max` 40 rem for the reading column, `--nav-height` 4.25 rem for the bottom bar, `--rail-width` 15 rem for the wide-screen rail. Wide-screen layout starts at 60 rem.

### 2.4 Motion tokens

`--ease-calm: cubic-bezier(0.2, 0.7, 0.2, 1)`, `--dur-quick: 160ms`, `--dur-drift: 520ms`. Both durations become `0ms` when less motion applies (section 4). See [6 Motion](#6-motion).

## 3. Themes and contrast

- **Light** is the default. **Dark** follows the system setting (`prefers-color-scheme: dark`), with the same token names.
- `:root[data-theme="dark"]` exists as a manual override hook for later use. The app does not expose a theme switch today (the brief asks for system-following).
- The dark values: paper `#0f1a1c`, surface `#162527`, eddy `#1f2a25`, ink `#e3ece8`, ink-soft `#a9bbb6`, river `#7fc4c1`, river-contrast `#0c1718`, river-wash `#22393b`, moss `#9bcb91`, pebble `#d2bc8c`, line `#3a4f51`, focus `#9fd8ff`.

**Measured contrast (WCAG 2.x, computed from these tokens):**

| Pair                                  | Light | Dark  |
| ------------------------------------- | ----- | ----- |
| ink on paper                          | 13.35 | 14.71 |
| ink-soft on paper                     | 6.92  | 8.84  |
| ink-soft on eddy                      | 6.00  | 7.39  |
| river (link text) on paper            | 6.18  | 8.92  |
| river-contrast on river (button text) | 7.01  | 9.18  |
| river on river-wash (active nav)      | 5.36  | 6.16  |
| pebble (task note) on surface         | 4.55  | 8.52  |
| moss (leaf) on surface                | 5.57  | 8.54  |
| focus ring on paper                   | 7.68  | 11.60 |

Every text pair is at least 4.5:1. Non-text indicators (leaf states, focus ring) are at least 3:1. The lowest text pair is pebble on light surface (4.55:1); do not use pebble for text smaller than the task note line without re-checking.

## 4. Accessibility

Mechanisms, all on this device (localStorage, see `src/ui/a11y/prefs.ts`) and applied as attributes on `<html>` before first paint (inlined boot script in `src/app/layout.tsx`):

| Need                   | Mechanism                                                                                                                      | Attribute / token                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Reduced motion         | Respects the system setting always (CSS `prefers-reduced-motion`). An in-app "Less motion" control forces the same.            | `data-motion="less"`                   |
| Text size              | Standard, Larger (112.5%), Largest (125%) of the root size. Every size is rem, so it also follows the browser's own text size. | `data-text-size="larger" \| "largest"` |
| Dyslexia-friendly font | Lexend body text, letter and word spacing slightly wider, line height 1.7.                                                     | `data-font="dyslexia"`                 |

Embeddable controls (the Frontend AI agent places them in its Settings; the stub Settings page already shows them): `AccessibilityControls` in `src/ui/a11y/controls.tsx`, which bundles the three choices, or the same three choices can be placed on their own.

Other baseline rules, enforced in code:

- **Keyboard.** Every control is a native button, link, input or dialog. Focus is always visible (`:focus-visible`, 3 px focus ring, 3 px offset). A skip link is the first focusable element. Sheets are native `<dialog>` elements, so focus is trapped and Escape closes them.
- **Screen readers.** Landmarks: the rail or bottom bar is `nav`, the content is `main`, the rail is `aside`. Headings are in order (one h1 per screen). Task checkboxes are `role="checkbox"` with the task title in the label. Dynamic changes are announced in live regions: toasts (`role="status"`, or `alert` for problems), the offline line, the sync line, and the timer's end.
- **Touch.** Every tap target is at least 44 px.
- **Colour.** Meaning is never carried by colour alone: completion is a pebble shape, in-progress is a filled leaf, and text labels say what things are.

## 5. Components

All in `src/ui/`. Client components are marked `"use client"`. Icons are inline SVG (`icons.tsx`), decorative (`aria-hidden`).

| Component                                              | File                                | Purpose                                                                   |
| ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `Button` (`primary`, `quiet`, `line`, `soft`; `small`) | `primitives.tsx`                    | every button                                                              |
| `IconButton`                                           | `primitives.tsx`                    | icon-only control, always with an `aria-label`                            |
| `TextField`, `TextAreaField`, `SelectField`            | `primitives.tsx`                    | labelled fields with optional hint                                        |
| `ChoiceGroup`                                          | `primitives.tsx`                    | a radio group styled as pills (energy, priority, kind)                    |
| `ToggleField`                                          | `primitives.tsx`                    | a labelled checkbox                                                       |
| `Sheet`                                                | `primitives.tsx`                    | a native dialog: bottom sheet on phones, centred on larger screens        |
| `ScreenTitle`, `EmptyState`, `Notice`, `LoadingLine`   | `primitives.tsx`                    | screen furniture                                                          |
| `ToastProvider`, `useToast`                            | `toast.tsx`                         | short messages with optional Undo                                         |
| `Leaf`, `LeafCheck`                                    | `leaf.tsx`                          | the task mark and its checkbox                                            |
| `TaskRow`                                              | `tasks/task-row.tsx`                | a task in any list, with a gentle note for a repeating task that is quiet |
| `RecurrenceEditor`                                     | `tasks/recurrence-editor.tsx`       | never / every day / every few days / weekdays / monthly                   |
| `FreshLookActions`                                     | `fresh-look/fresh-look-actions.tsx` | reschedule, break down, snooze, let go                                    |
| `Eddy`                                                 | `today/eddy.tsx`                    | the fresh-look pocket on Today                                            |
| `PlanSheet`                                            | `today/plan-sheet.tsx`              | choose today's plan (suggestions, energy, confirm)                        |
| `ReflectionCard`                                       | `today/reflection-card.tsx`         | the evening journal invitation                                            |
| `QuickAddProvider`, `useQuickAdd`                      | `shell/quick-add.tsx`               | the Capture sheet                                                         |
| `AppShell`                                             | `shell/app-shell.tsx`               | top bar, navigation, offline and sync line                                |
| `AccessibilityControls`                                | `a11y/controls.tsx`                 | text size, dyslexia font, less motion                                     |
| `SignOutButton`                                        | `sign-out-button.tsx`               | sign out and clear the device's copies                                    |

**Surfaces.** Cards (`.fz-card`) use the surface colour and no border. The eddy (`.fz-eddy`) uses the eddy colour. Lists are plain rows separated by space, not boxes. No drop shadows except the sheet and toast shadow.

## 6. Motion

- **One orchestrated moment:** completing a task drifts its leaf off the list (`--dur-drift`), then the change is sent. If the change fails, the leaf returns and a calm message appears.
- **Entrance:** each main screen fades in once (`fz-stream-enter`). Nothing animates on every card.
- **Sheets** rise slightly on open (`--dur-quick`).
- **Focus screen:** no breathing or looping animation. The timer is a number, not a moving graphic.
- **Rules:** motion answers a person's action or appears once. No looping animation outside the Focus leaf (none in use). Nothing that moves is required to understand the screen. With less motion, every duration is `0ms` and the drift is a plain change.

## 7. Copy and tone

Voice: warm, brief, calm. Plain verbs, sentence case, no exclamation marks in normal copy. Never scolding, never guilt, never the word **overdue**, never a day count of lateness, never streaks, points, badges or confetti.

**Vocabulary (use these, keep them consistent):**

| Situation                              | Words                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Task completed                         | "Done." (repeating: "Done for this time.")                                                                                                |
| Task reopened                          | "Reopened."                                                                                                                               |
| Saved                                  | "Saved."                                                                                                                                  |
| Task added                             | "Added to your Inbox" or "Added to {project}"                                                                                             |
| Fresh-look reasons                     | "It was planned for an earlier day." and "It has been quiet for a while."                                                                 |
| Suggestion reasons                     | "Due today" (also used for past dates, never as a failure), "Due soon", "Already in progress", "High priority", "Not touched for a while" |
| Repeating task that keeps being missed | "This one has been quiet for a while. Adjust it or pause it?"                                                                             |
| Offline                                | "You're offline. Today still opens from this device, and anything you add waits here."                                                    |
| Saved on this device                   | "Saved on this device. It will arrive when you're back online."                                                                           |
| Action buttons                         | Say what happens: "Show me", "Not today", "Set today's plan", "Add task", "Park it", "Let it go", "Yes, let it go", "Keep it"             |

Failure copy comes from the API's calm `message` (see `foundation.md` section 6) or from the offline wording above. Errors are never red and never apologise at length.

Dates are written as "Today", "Tomorrow", "Wed 11 Nov", with the year only when it is not this year. Times are "5:00 pm".

## 8. Extension points

Nine named slots (`src/ui/extensions/slots.tsx`) and one service-worker hook. Each has a manual alternative, so the app is complete with nothing plugged in.

**Usage contract.** `<ExtensionSlot name="…" fallback={…}>{enhancement}</ExtensionSlot>`. When children are given they replace the fallback. When not, the fallback (or nothing) shows. The slot's wrapper is `display: contents` and adds no layout. Components that fill a slot receive their own props; the host screen decides where the slot sits.

| Slot name               | Where it renders                                               | Filled by                                               | Manual alternative (fallback)                               |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| `global-assistant`      | top bar, beside Capture (persistent)                           | Frontend AI: chat entry and panel                       | nothing (no entry point)                                    |
| `plan-day-proposal`     | top of the plan sheet                                          | Frontend AI: AI-ranked 3–5 items with reasons           | the rules-based suggestions shown below it                  |
| `task-assist`           | Today (under the plan), Focus (under the step) and task detail | Frontend AI: "I'm stuck", break down                    | nothing; the manual steps section and options remain        |
| `quick-add-assist`      | reserved in the quick-add sheet (not yet rendered)             | Frontend AI: smarter parsing hint                       | the deterministic parser (`POST /api/quick-add/parse`)      |
| `fresh-look-assist`     | inside the fresh-look sheet, above the manual options          | Frontend AI: AI help options                            | the manual options (reschedule, break down, snooze, let go) |
| `reflection-prompt`     | the reflection card, replacing the plain wording               | Frontend AI: AI-worded prompt                           | "A line or two is plenty. Or skip it. Either is fine."      |
| `settings-sections`     | Settings, after the look-and-feel controls                     | Frontend AI: settings sections                          | nothing                                                     |
| `notifications-section` | Settings, after `settings-sections`                            | Nudges: notification settings (mute, quiet hours, push) | nothing                                                     |
| `task-detail-mute`      | task detail, under the Focus action                            | Nudges: per-task mute                                   | nothing                                                     |

Notes for the fillers:

- `quick-add-assist`: the slot is not yet rendered inside the quick-add sheet. Frontend AI adds it there, next to the "What I understood" list, when it builds the hint.
- Slots are rendered by the shared screens, so a filler edits the one component that owns the slot and nothing else.

### 8.1 Service worker push hook (`service-worker-push-module`)

`public/sw.js` is the core worker: caching, offline navigation, and the cache clear on sign-out. It does not contain push or notification code.

To add behaviour, the Nudges agent:

1. Puts a classic script in `public/sw/modules/`, for example `push-handler.js`. The script adds its own listeners at top level (`self.addEventListener("push", …)`).
2. Adds the path to the `FLOWZONE_SW_MODULES` array in `public/sw/modules/index.js`.

`sw.js` never changes. The modules run inside the worker, cannot use the DOM, and must not log personal content.

### 8.2 Offline and sync contracts (for other agents)

- **Capture queue** (`src/ui/offline/capture-queue.ts`): `saveCapture({ text } | { fields } | { entry })` keeps a task, or a note or journal entry, on the device, tagged with the owner. An optional `clientRequestId` reuses the id of a failed attempt. `flushCaptures()` sends each item with its request id. `setCaptureOwner(id)` is called by the shell.
- **Today snapshot** (`src/ui/offline/snapshot.ts`): the last Today, shown read-only when the network is gone.
- **Sign-out** clears the device's captures, the Today snapshot and the cached pages (`SignOutButton`).

## 9. Test hooks

Use these, and the accessible roles and names, in tests. Stable `data-testid` values:

| Hook                                                                                                                                                                                                                       | Element                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `quick-add-button`, `quick-add-sheet`, `quick-add-form`, `quick-add-input`, `quick-add-title`, `quick-add-project`, `quick-add-date`, `quick-add-time`, `quick-add-priority`, `quick-add-save`, `quick-add-understood`     | Capture                                                                                                |
| `nav-today`, `nav-inbox`, `nav-projects`, `nav-notes`, `nav-settings`                                                                                                                                                      | navigation (one `nav.fz-nav`: bottom bar on phones, rail on wide screens) |
| `offline-line`, `sync-line`, `toasts`                                                                                                                                                                                      | shell status                                                                                           |
| `today-plan`, `plan-task`, `plan-prompt`, `plan-prompt-show`, `plan-sheet`, `plan-option`, `plan-confirm`, `plan-energy`                                                                                                   | Today and the plan                                                                                     |
| `eddy`, `eddy-item`, `fresh-look-sheet`, `fresh-look-actions`                                                                                                                                                              | fresh look                                                                                             |
| `reflection-card`                                                                                                                                                                                                          | reflection                                                                                             |
| `inbox-list`, `inbox-task`                                                                                                                                                                                                 | Inbox                                                                                                  |
| `project-list`, `project-name-input`, `project-add`, `project-task-input`, `project-tasks`, `project-task`, `project-delete`, `project-delete-confirm`                                                                     | projects                                                                                               |
| `task-done`, `task-title`, `task-date`, `task-time`, `task-priority`, `task-energy`, `task-save`, `task-steps`, `step-input`, `step-add`, `step-check`, `task-notes`, `task-options`, `task-delete`, `task-delete-confirm` | task detail                                                                                            |
| `repeat-editor`, `repeat-kind`, `repeat-interval`, `repeat-days`, `repeat-day-of-month`, `repeat-paused`                                                                                                                   | repeat settings                                                                                        |
| `focus-screen`, `focus-step`, `focus-done`, `focus-next`, `timer-start`, `timer`, `park-input`, `park-save`                                                                                                                | Focus                                                                                                  |
| `notes-filter`, `notes-list`, `new-note`, `new-journal`, `entry-form`, `entry-kind`, `entry-title`, `entry-body`, `entry-date`, `entry-save`, `entry-delete`, `entry-delete-confirm`                                       | notes and journal                                                                                      |
| `accessibility-controls`, `text-size`, `dyslexia-font`, `less-motion`                                                                                                                                                      | accessibility controls                                                                                 |
| `sign-in-google`, `sign-out`, `sign-out-confirm`                                                                                                                                                                           | sign-in and sign-out                                                                                   |
| `[data-slot="<name>"]` with `data-filled="true                                                                                                                                                                             | false"`                                                                                                | every extension slot |

## 10. Layout and navigation

- **Phone (below 60 rem):** sticky top bar (wordmark, Capture, the global-assistant slot), a single column, and a fixed bottom bar with five items: Today, Inbox, Projects, Notes, Settings. Each item has a visible label.
- **Wide screens (60 rem and up):** a left rail with the same five items and labels, and the content in a centred reading column (40 rem). The bottom bar is hidden. The top bar keeps Capture.
- **Capture** is always on screen in the top bar. It opens a sheet that reads the text with the deterministic parser and shows what it understood.
- **Focus** is not in the navigation. It opens from a task (Today's plan, task detail).
- **Alignment:** text is left-aligned and ragged-right. Nothing is justified or centred, except the Focus screen, which is centred by design.
- **Line length:** prose stays within the reading column (40 rem), under about 80 characters.
</content>
