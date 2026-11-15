# Defect log

Recorded by QA & Docs during the first automated run of the suite and the manual review of the handoffs. Each row names the agent that owns the code. QA fixes only small, clearly scoped bugs (no new behaviour); anything larger, or that would change a contract, is listed here for the owner and the owning agent and is **not** fixed by QA.

Severity: **High** = data loss, a safety or privacy problem, or a core flow blocked. **Medium** = a core promise broken, with a workaround. **Low** = cosmetic or documentation.

Status: **Open** (not fixed), **Fixed** (fixed in this pass, verified by the named test), **Watching** (seen, not reproduced in isolation).

## Summary

| ID   | Severity | Summary                                                                                                                                | Owner                                   | Status                                                   |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| D-01 | High     | The scheduler's call to `POST /api/nudges/tick` is refused with `401` by `src/proxy.ts`, so scheduled nudges never reach the endpoint  | Foundation (proxy and contract), Nudges | Open: needs the owner's decision                         |
| D-02 | High     | A second new note or journal entry started in the app is silently dropped                                                              | Frontend Core                           | Fixed (QA), verify by review                             |
| D-03 | Medium   | When an AI reply fails mid-stream, the person's typed message is cleared                                                               | Frontend AI                             | Fixed (QA)                                               |
| D-04 | Medium   | Offline page may show on a slow connection when nothing is saved yet                                                                   | Frontend Core                           | Watching (seen in the suite under load)                  |
| D-08 | Low      | Capture shows "Something went wrong on our side" when the sign-in check is still running, instead of the calm message the code intends | Frontend Core                           | Open                                                     |
| D-05 | Low      | `docs/contracts/design-system.md` fails the Prettier format check                                                                      | Frontend Core (contract owner)          | Open: not edited by QA (contract)                        |
| D-06 | Low      | Next's build warning about the Atkinson Hyperlegible font metrics                                                                      | Frontend Core                           | Open (known, no fix available)                           |
| D-07 | Info     | The app's built-in rate limiter (Better Auth) throttles many fast sign-ins from one address                                            | Foundation                              | Mitigated in the suite; left on in production on purpose |

---

## D-01: the scheduler cannot reach the tick endpoint (High)

- **Steps to reproduce:** send `POST /api/nudges/tick` with the correct `x-flowzone-tick-secret` header and no session cookie. The request is answered `401 unauthenticated` by `src/proxy.ts` before the route runs.
- **Expected:** the tick endpoint checks its own secret (`docs/contracts/nudges.md`, section 2) and runs.
- **Effect:** the GitHub Actions scheduler cannot send nudges to any device. Everything else about nudges works when called with a session (the suite does this).
- **Why not fixed by QA:** the fix is one entry in `PUBLIC_PATHS` in `src/proxy.ts`, but `docs/contracts/foundation.md` (section 5) lists the public paths, so it changes a contract. The Nudges handoff asks the owner to decide.
- **Owner decision needed:** approve adding `/api/nudges/tick` to the public list, and update the Foundation contract to match.
- **Test:** `e2e/nudges.spec.ts`, "known defect D-01…", marked `test.fail()` so it stays visible. When the fix lands, the test will report as passing unexpectedly; change it to a normal test.

## D-02: a second new note or journal entry is silently dropped (High, fixed)

- **Steps to reproduce:** in the app, create a note (Notes → New note → save). Then, without a page reload, open Notes → Journal entry and save a line.
- **Observed:** the journal line is not saved. The app shows "Saved." and goes back to the list. The API returns the first note again.
- **Cause:** the editor keeps its request id in component state. The form was keyed `"new"` for every new entry, so React kept the first entry's state. The second save was sent with the first request id, which the server treats as a retry (`docs/contracts/foundation.md`, section 7), so it returned the existing row.
- **Fix (QA, small):** `src/ui/notes/notes-screens.tsx` keys a new entry by its entry point (`new:` plus the start parameters), so a different entry point gets a fresh form.
- **Verify:** `e2e/notes-and-journal.spec.ts`, "a note and a journal entry are saved through two entry points", which reproduced the defect before the fix. Owner (Frontend Core) to review the change.

## D-03: a failed AI reply clears what the person typed (Medium, fixed)

- **Steps:** in the assistant, send a message the provider cannot answer (the stand-in replies to "error" this way).
- **Observed:** the reply shows "AI is resting for now", but the text box is emptied. The handoff (`docs/handoff/05-frontend-ai.md`, section 4) promises the text stays.
- **Cause:** a provider failure arrives inside the stream, so the request itself "finishes" and the draft was cleared as sent.
- **Fix (QA, small):** `src/ui/ai/assistant.tsx` records a failure inside the stream and keeps the draft.
- **Verify:** `e2e/ai.spec.ts`, "a provider failure shows 'AI is resting' calmly and keeps the person's text". Owner (Frontend AI) to review.

## D-04: a slow connection can show the offline page (Medium, watching)

- **Mechanism:** `public/sw.js` waits 3 seconds for the network for a page. If it is slower and no saved copy exists, the worker answers with its "You're offline for now" page, even though the person is online.
- **Observed:** under the heavy parallel test run, a Today page showed "You're offline for now" while the device was online, on two separate runs (screenshots kept in `test-results/`, not in the repository). The mechanism matches the 3-second fallback above. A simulated 4.5-second delay on a fresh session in isolation did **not** reproduce it, so the cause is confirmed only as a timing effect under load, not as a defect in isolation.
- **Test handling:** `e2e/offline.spec.ts` reloads again if the offline page appears, and still checks that the copy exists. This hides the symptom in the suite, so the defect stays open.
- **Risk:** a cold start on a slow host, or a poor mobile network, could show "offline" to someone who is online.
- **Owner:** Frontend Core. Suggested: retry or wait longer before the offline fallback, and say "still loading" rather than "offline" when the device reports it is online.
- **Tests affected:** `e2e/offline.spec.ts`, "Today opens from the saved copy when offline". It now waits for the real page before the offline step.

## D-05: contract file fails the format check (Low)

- `docs/contracts/design-system.md` has table alignment that Prettier rewrites. It is a contract, so QA did not edit it. `npm run format:check` reports it. Owner: Frontend Core (contract owner), or run `npx prettier --write docs/contracts/design-system.md` once they agree.

## D-08: a wrong message while the sign-in check runs (Low)

- **Steps:** open the app and capture a task before the app has finished checking who is signed in (it happens for a moment after loading, and it is longer on a slow connection).
- **Observed:** the sheet says "Something went wrong on our side. Please try again." It should say the calm message the code intends ("We're still checking who is signed in…").
- **Cause:** `saveCapture` in `src/ui/offline/capture-queue.ts` throws a plain `Error`, and `messageFor` in `src/ui/api/client.ts` turns any non-API error into the generic internal-error message.
- **Owner:** Frontend Core. Suggested: let the sign-in-check message through, or wait for the check before enabling Save.
- **Test impact:** the offline capture tests now wait for the sign-in check before going offline.

## D-06: font metrics build warning (Low, known)

- `next build` prints "Failed to find font override values for font `Atkinson Hyperlegible Next`". Nothing renders wrong. It is recorded in the Frontend Core handoff and cannot be silenced by a setting in this Next version.

## D-07: built-in rate limit during parallel tests (Info)

- Better Auth's built-in rate limiter is on in production builds. The suite sends many sign-ins and page checks from one address, so some test logins returned `429`. Mitigations in the suite: two workers by default (`E2E_WORKERS`) and a short retry in the test-login helper. The limiter stays on in production, deliberately; no product change was made.

---

## Not verified in this pass (not defects; listed so nothing is hidden)

- **Real deployment:** the brief's final verification on Vercel or a preview has **not** been performed. It needs the owner's approval and the account steps in the Foundation handoff.
- **Real devices:** see [push checklist](push-checklist.md). Nothing has been run on a phone or with real push.
- **Quick-add time field:** the Frontend Core handoff reports that `POST /api/quick-add/parse` returns an empty `text` for the time field. QA did not re-check it; it is a cosmetic issue for the Backend owner.
