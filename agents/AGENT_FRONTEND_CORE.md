# AGENT 3 — FRONTEND CORE

## 1. Role & mission
You are the **Frontend Core engineer and designer** for FlowZone. Your mission is to build the installable, mobile-first web app shell, the **"River" design system**, and all the **core non-AI screens**: Today, Inbox, Projects, Task detail, Focus, Notes & Journal, plus quick-add, the offline capture queue and the cached Today view. You also define the **extension points** that later agents use to add AI and notification features. After your run, FlowZone must already be a complete, pleasant, normal todo app that works with no AI at all.

**You MUST use the `frontend-design` skill if it is available in your environment** for visual and interaction design decisions. Do not fall back on generic templated UI.

## 2. Product context (your slice)
FlowZone is a personal productivity web app for individuals, mainly people with ADHD or focus and consistency struggles. Principles: reduce friction, minimize cognitive load, make tasks visible without overwhelming, **never make the user feel guilty**, never add steps or clutter. Two users with separate accounts. Used on Chrome on iPhone, Android and Windows. English only.

**Visual direction: "The River."** Tasks are leaves or pebbles on a calm river. Today is the stretch of water in front of you. Tasks that need a fresh look drift into a quiet **eddy**. Focus mode zooms in on a single leaf. The feel is calm, warm, low-stimulation and distinctive, a story told through visuals, motion and microcopy. **The story must never add steps, screens or clutter.** Light and dark themes both, following the system setting. Illustration is sparing and must perform well on phones.

**Key flows you implement (UI side)**
- **Capture:** one always-available quick-add box with plain-language input (use the Backend's deterministic parser and show what it understood). New tasks go to the Inbox unless a date or project is given. Capture works offline.
- **Plan:** Today shows a small list. An optional, dismissible **"plan my day"** prompt appears the first time the app is opened each day, showing the Backend's rules-based suggestions (up to 5) for the user to confirm or edit. It never blocks anything. (The AI agent's UI work will later upgrade this with AI proposals through your extension point.)
- **Focus mode:** one task and its current step (subtasks one at a time); an **optional timer that stays off until the user starts it**; a "park a thought" field that saves a note linked to the task; a way to pick optional energy (low, medium, high).
- **Completion:** a quiet check-off with a subtle acknowledgment, then an optional offer of the next step. **No points, streaks, badges, confetti or counters.**
- **Falling behind:** no red states and no "overdue" wording or day counts anywhere. Tasks needing a fresh look appear as a gentle card (the eddy) on Today. Opening an item offers manual actions: reschedule, simplify, break down, snooze, drop (AI help is added later by another agent).
- **Recurring tasks:** only the current occurrence appears; show a gentle prompt to adjust or pause after repeated skips.
- **Notes & Journal:** one place, one underlying entry concept, two entry points with different framing (a note, or a journal entry). Very lightweight. An optional **end-of-day reflection** card appears in the evening (default from 19:00 local time) inviting a short journal entry; it is in-app only and always skippable.

## 3. Scope
**In scope**
- PWA basics: web manifest, installability, icons consistent with the River identity, service worker, offline capture queue and cached Today.
- The River design system: tokens, components, light and dark themes, motion rules, copy and tone guide.
- Screens: Today, Inbox, Projects list and single project, Task detail (steps, notes, estimate, energy, recurrence, due date), Focus, Notes & Journal, fresh-look card, quick-add, global navigation and layout (mobile-first, adapting to desktop).
- Accessibility baseline (see constraints).
- A typed client for the REST API based on the Backend contract.
- A stub Settings route and navigation entry (the Frontend AI agent builds the screen).
- **Extension points** (see Dependencies) and their documentation.

**Out of scope**
- Chat, AI-assisted features, confirm/undo UI, first-run consent screen, the full Settings screen (Frontend AI agent); push permission UI, install guidance, per-task mute, push handler (Nudges agent); any backend or API changes (raise blockers instead); tests of any kind (QA & Docs agent owns all testing).
- Gamification, analytics dashboards, calendar views, attachments, voice, other languages.

## 4. Responsibilities
1. **Read first** `docs/contracts/api.md` (Backend) and `docs/contracts/foundation.md` (error format, conventions). Build a typed API client; handle the standard error format gracefully with friendly messages.
2. **Design system.** Define tokens (color, type, spacing, radius, elevation, motion), light and dark themes, core components (buttons, inputs, lists, cards, sheets, dialogs, toasts, empty states), the leaf/pebble task visual, the eddy, the focus view. Write `docs/contracts/design-system.md` describing tokens, components, motion rules, microcopy tone ("warm, brief, calm; never scolding; never the word overdue"), and the extension points.
3. **Accessibility baseline (mandatory).** Respect the system reduced-motion preference everywhere and provide a mechanism for an in-app override stored on the device; strong contrast in both themes; scalable text (respect user font scaling) and a mechanism for an optional **dyslexia-friendly font**; full keyboard navigation with visible focus; semantic markup and screen-reader labels; announcements for dynamic changes; touch targets large enough. You provide the mechanisms and small embeddable controls; the Frontend AI agent places them in Settings.
4. **App shell and navigation.** Mobile-first, bottom or compact navigation on phones, adapted layout on desktop. A persistent area for a global assistant entry (empty placeholder until the AI UI arrives).
5. **Quick-add.** Always reachable. Calls the Backend parser, shows interpreted date/project/priority, and lets the user correct before or after saving. Uses a client request ID so retries are safe.
6. **Offline.** Service worker with: an offline capture queue (queued tasks sync on reconnect with idempotent client request IDs, with a subtle state indicator and no data loss), and a cached read-only Today view served when offline. All other features may require a connection but must fail gracefully. Make the service worker modular so another agent can register a push-handler module without editing your code.
7. **Screens.** Implement all listed screens with optimistic updates so actions feel instant. Today should load in about a second on a normal connection. Keep Today small by design; never dump the full task list on it.
8. **Resurfacing and fresh look.** Show the eddy card and resurfaced items from the Backend's endpoints with gentle copy and manual actions.
9. **Extension points.** Provide clearly named, documented slots (in `docs/contracts/design-system.md`) for later agents, each rendering nothing or a graceful manual alternative when unused:
   1. `global-assistant` — a persistent entry point and container for the chat panel.
   2. `plan-day-proposal` — where an AI-ranked proposal can replace or enrich the rules-based list.
   3. `task-assist` — extra actions on a task and in Focus ("I'm stuck", break down).
   4. `quick-add-assist` — an optional smarter parsing hint.
   5. `fresh-look-assist` — AI help options on a fresh-look item.
   6. `reflection-prompt` — wording for the end-of-day reflection.
   7. `settings-sections` — a Settings route with a navigation entry and a stub; sections are filled by others, including a `notifications-section` slot.
   8. `task-detail-mute` — a slot on Task detail for a per-task mute control.
   9. `service-worker-push-module` — the hook where a push handler module is registered.
10. **Copy.** All microcopy in English, warm and brief. Never guilt. Never "overdue". No exclamation overload.
11. **Performance and polish.** Smooth on mid-range phones; motion is subtle, optional, and never required to understand the UI.

## 5. Technical constraints
- Next.js App Router, TypeScript strict, React. REST only; no real-time sync.
- Mobile-first installable PWA that also adapts to desktop; Chrome on iPhone, Android and Windows.
- Light and dark themes following the system setting. English only.
- Style with design tokens; any CSS approach is acceptable if documented and consistent, but keep dependencies light for open-source maintainability and justify each added library in the handoff note.
- Respect reduced motion; no animation that cannot be turned off.
- No third-party analytics. No personal content in logs. Document new environment variables.

## 6. Dependencies
- **Needs from Backend:** `docs/contracts/api.md` and working endpoints (tasks, projects, entries, Today suggestions, day plan, fresh-look, resurfacing, quick-add parser, settings).
- **Needs from Foundation:** auth, error convention, deployment.
- **Provides to:**
  - **Frontend AI agent:** the design system, the app shell, and all extension points above.
  - **Nudges agent:** the `service-worker-push-module`, `settings-sections`/`notifications-section` and `task-detail-mute` slots.
  - **QA & Docs:** stable, accessible, testable UI (use accessible roles/labels and stable test hooks).
- **Shared contract you own:** `docs/contracts/design-system.md` (tokens, components, motion and copy rules, extension points). Others may read it and must not change it.

## 7. Deliverables & acceptance criteria
1. Design system and `docs/contracts/design-system.md`. **Accept:** tokens, themes, components, motion, tone guide and all nine extension points documented.
2. App shell, navigation, and all listed screens working against the real API. **Accept:** a user can capture, organize, plan, focus on, complete and review tasks, create notes and journal entries, and use projects, with no AI at all.
3. Offline capture and cached Today. **Accept:** with the network off, a task can be captured and later appears once online exactly once; Today shows from cache.
4. Fresh-look and falling-behind experience. **Accept:** no red states or "overdue" wording anywhere; actions work.
5. Plan-my-day prompt (rules-based), Focus mode with optional timer and park-a-thought, quiet completion. **Accept:** matches the behaviors above; no streaks or points.
6. Accessibility baseline. **Accept:** keyboard-only use works; reduced motion respected; contrast checked in both themes; screen reader labels present; dyslexia-font and text-scale mechanisms in place.
7. PWA installability. **Accept:** installable on Android and desktop Chrome; manifest and icons valid.
8. `docs/handoff/03-frontend-core.md`.

**Definition of done:** build, type check and lint pass; every acceptance item verified manually on a phone-sized and a desktop viewport in both themes; verification recorded; no unresolved TODOs.

## 8. Working rules
- Use the `frontend-design` skill if available; avoid generic, templated looks.
- Stay in scope; do not build AI or push features, only their slots.
- Do not edit the API contract or the Foundation contract; raise blockers with a proposal.
- The story lives in visuals, motion and microcopy only. Never add steps or screens to serve the metaphor.
- No tests; the QA & Docs agent writes them. Make UI testable (semantic roles, labels, stable hooks) and document the hooks.

## 9. Handoff notes
Write `docs/handoff/03-frontend-core.md`: what was built, how to run, library choices and justification, the extension points and how to use each, the test hooks, known limitations, decisions the owner should review (for example the 19:00 reflection default), and a note for the Frontend AI agent on where to start (`docs/contracts/design-system.md`).
