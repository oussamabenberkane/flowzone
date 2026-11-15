# Handoff 07: QA & Docs

Owner of the suite, the coverage matrix, the defect log and the documentation: QA & Docs (Agent 7). Contracts were **not** edited.

Status: **the suite is built and passing locally** (206 of 206 cases pass; two of them are known-defect tests that are expected to fail, see section 4). **Not run on a real deployment, not run on real devices, not committed.** Those three things are the gaps; see section 3.

## 1. How to run the tests

Full steps: [docs/testing.md](../testing.md). Short version:

1. A local, disposable Postgres whose database name contains `test`:
   `docker run -d --name flowzone-pg-test -e POSTGRES_USER=flowzone -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=flowzone_test -p 54400:5432 postgres:17-alpine`
2. `npx playwright install chromium` (once).
3. `E2E_DATABASE_URL="postgresql://flowzone:<password>@localhost:54400/flowzone_test" npm run test:e2e`

The suite starts its own test server on port 3100 (migrate, build, start) with test-only settings, runs everything on a phone viewport (390 x 844) and a desktop viewport (1280 x 860), and removes every test account at the end. `E2E_REUSE_SERVER=1` reuses a running test server to iterate faster.

Checks run in this pass:

| Check | Result |
| ----- | ------ |
| Full suite, both viewports (`npm run test:e2e`) | 206 passed; 2 are expected-failure tests for defect D-01 |
| Targeted re-runs after the last small edits | pass (today-and-focus, falling-behind, offline) |
| `npx tsc --noEmit` | pass |
| `npm run lint` (whole repository) | pass, no errors or warnings |
| Production build with test settings (inside the suite's web server) | pass (the Atkinson font warning, D-06, is still printed) |
| `npx prettier --check` on QA-owned files | pass |
| `npm run format:check` (whole repository) | **fails** on other agents' files (section 3) |

## 2. What is covered and what is not

Full matrix: [docs/qa/coverage.md](../qa/coverage.md), 47 requirements. Summary:

- **Covered:** capture and the Inbox, tasks and details, subtasks, projects, Today's plan and prompt, Focus (timer, park-a-thought, quiet completion), falling-behind (calm words, fresh-look actions, repeating tasks that never pile up), notes and journal, the evening reflection, first-run switches and the no-AI plain app, AI chat, risk tiers with undo and confirmation, consent gating, resting states, profile proposals, nudges via the tick (cap, quiet hours, gap, mute, snooze, switch off, reason, no guilt wording), settings (switches, quiet hours, display controls, export, delete account), two-user isolation (24 cross-user API attempts plus lists, history, exports and settings), accessibility scans on ten main screens plus the Capture sheet and sign-in in both themes, keyboard flows, reduced motion, responsive layout on both viewports.
- **Partly covered (gaps are stated in the matrix):** recurring-task creation through the repeat editor, the in-progress status, the Focus step, editing an existing profile line, the confirm-tier journal edit and note deletion, the AI sheets in the accessibility scans, Google sign-in refusals (manual only), and the "once a day" plan prompt returning the next day.
- **Not covered by automation:** real Google sign-in, real push delivery to Android, Windows and iPhone, real network loss on a phone, the AI's answer quality (the stand-in is scripted), and any deployed environment.

## 3. Open items and what the owner must do

### 3.1 Owner actions (manual)

1. **Real-device checks**: [docs/qa/push-checklist.md](../qa/push-checklist.md). Sections A to F. Record results in the table; report any failure with the device and steps (no personal content).
2. **Google sign-in** (Foundation step 8): check the two allowed accounts sign in and a third is refused.
3. **Approve a run against a deployment.** The brief's final verification on Vercel or a preview has **not** been done. It needs your go-ahead and the account steps in the Foundation handoff. When you give it, run the suite with `E2E_DATABASE_URL` pointed at a local test database and the app's Vercel preview as a manual pass, or ask QA to do the manual pass with you.
4. **Decide D-01** (section 4): whether `/api/nudges/tick` may be public in `src/proxy.ts`.
5. **Commit.** Nothing has been committed or pushed. The working tree also holds other agents' uncommitted work (see 3.3). Commit only when you say so.

### 3.2 Open defects (full detail in [docs/qa/defects.md](../qa/defects.md))

| ID | Severity | Owner | Status |
| -- | -------- | ----- | ------ |
| D-01 | High | Foundation (contract and `src/proxy.ts`), Nudges | **Open**. Owner decision needed. Scheduled nudges never reach the endpoint. |
| D-02 | High | Frontend Core | **Fixed by QA** (`src/ui/notes/notes-screens.tsx`: a second new entry no longer reuses the first one's request id). Verified by a passing test. Owner to review. |
| D-03 | Medium | Frontend AI | **Fixed by QA** (`src/ui/ai/assistant.tsx`: a failed reply keeps the typed message). Verified by a passing test. Owner to review. |
| D-04 | Medium | Frontend Core | **Watching**. Under load the offline page appeared while online, on two runs. Not reproduced in isolation. The offline tests now retry the reload. |
| D-05 | Low | Frontend Core (contract owner) | Open. `docs/contracts/design-system.md` fails the Prettier check. Not edited by QA. |
| D-06 | Low | Frontend Core | Known. Atkinson font-metrics build warning. |
| D-07 | Info | Foundation | Mitigated in the suite. Better Auth's built-in rate limiter throttles fast sign-ins; left on in production. |
| D-08 | Low | Frontend Core | Open. Capture shows a generic error while the sign-in check runs, instead of the calm message the code intends. |

### 3.3 Things QA found outside its area (not changed)

- **Other agents' handoffs fail the Prettier check** (`docs/handoff/03-frontend-core.md`, `05-frontend-ai.md`, `06-nudges.md`) and so does `docs/contracts/design-system.md`. These are formatting-only; their owners should run `npx prettier --write` on them.
- **Nudge tick log noise:** when a test deletes an account during a tick, the server logs one `nudges.tick_user_failed` line (foreign-key error for the deleted user's settings). Nothing is lost or exposed, and real use will rarely hit it. Owner: Nudges, low priority.
- **Shared working tree:** the files of Frontend Core, Frontend AI, AI, Nudges and Backend are still uncommitted together (see the Frontend Core handoff, section 10).

## 4. The known-defect tests

`e2e/nudges.spec.ts`, "known defect D-01…", is marked `test.fail()`. It is **expected to fail** and is reported as passing while D-01 is open. When D-01 is fixed, the test will report as unexpectedly passing: change it to a normal test (remove `test.fail`) in the same change.

## 5. Changes QA made (in files other than `e2e/`, `docs/qa/`, `docs/testing.md`, `docs/setup.md`, `docs/architecture.md`, `README.md`, `CONTRIBUTING.md`)

Each is small and deliberate:

- `src/ui/notes/notes-screens.tsx`: the new-entry form is keyed by its entry point (D-02). One expression.
- `src/ui/ai/assistant.tsx`: a failed streamed reply keeps the draft (D-03). Three lines.
- `package.json`: dev dependencies `@playwright/test` and `@axe-core/playwright`; scripts `test:e2e` and `test:e2e:report`.
- `.env.example`: a commented section for platform-set variables and test-only variables. No values.
- `.gitignore`: `/e2e/.tmp` (certificate and stub output).
- `eslint.config.mjs`: ignores Playwright output folders (`test-results`, `playwright-report`, `e2e/.tmp`).

Not changed: any contract, `src/proxy.ts`, `src/server/auth/auth.ts`, `public/sw.js`.

## 6. Deviations from the brief (and why)

- **Test data is set up through the API, not the seed script.** The seed script works only for the first two `ALLOWED_EMAILS` and replaces their data, which is wrong for disposable test accounts.
- **Each test creates its own accounts and deletes them.** Global teardown also removes leftover test accounts.
- **Push is tested with a local HTTPS stub** that records real, signed, encrypted pushes; the tests decrypt them with the device keys they made. Delivery through the browser vendors' services is manual.
- **Two workers by default** (`E2E_WORKERS`), because the app's built-in rate limiter throttled a faster run (D-07). A short retry is used in the test-login helper.
- **The accessibility scans are axe (WCAG 2.x A/AA) only.** They find many problems but not all; the keyboard and screen-reader passes are partly manual.

## 7. Documentation index

| Document | Audience |
| -------- | -------- |
| [README.md](../../README.md) | everyone: what FlowZone is, principles, features, quick start |
| [docs/setup.md](../setup.md) | a self-hoster: every variable, Google, database, AI, push, GitHub secrets, run, test, deploy |
| [docs/architecture.md](../architecture.md) | a developer: components, data flow, scoping rule, AI consent and tiers, scheduler, offline |
| [docs/testing.md](../testing.md) | a developer: running and writing the Playwright suite |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | a contributor: conventions, checks, where contracts live |
| [docs/qa/coverage.md](../qa/coverage.md) | the owner: requirement-by-requirement coverage |
| [docs/qa/defects.md](../qa/defects.md) | the owner and agents: defect log with owners and status |
| [docs/qa/push-checklist.md](../qa/push-checklist.md) | the owner: manual real-device checks |
| [docs/contracts/](../contracts/) | the rules each part is built to (owned by their agents) |

Environment check: every variable read by the application (`src/server/env.ts`) is in `.env.example`, with a comment and no value. The platform-set Vercel variables and the test-suite variables are now listed as commented entries too. GitHub Actions uses `NUDGE_TICK_SECRET` (secret) and `FLOWZONE_APP_URL` (variable), documented in the setup guide.

## 8. Recommended next steps

1. Owner: decide D-01, then Foundation changes the proxy and its contract, and Nudges re-runs the scheduler test end to end.
2. Frontend Core and Frontend AI: review D-02 and D-03 (the QA fixes) and fix D-04 and D-08.
3. Complete the manual push checklist on the owner's devices and record results.
4. Run the suite against a Vercel preview or production as a manual pass, with the owner's approval.
5. **CI (optional, not added):** run `npm run test:e2e` on pull requests with a Postgres service. Add it only if the owner asks.
6. Add the missing tests listed in the coverage matrix (recurring creation UI, in-progress status, profile edit, AI sheet scans).
7. Run `npx prettier --write` on the handoffs and the design-system contract (owned by their agents) so `npm run format:check` passes.
