# Testing

FlowZone is tested with **Playwright only**: functional tests in a real Chromium browser, automated accessibility scans, and isolation checks made with direct API requests. There are no unit tests and no API-only test suites, by decision of the owner. Tests run on your machine. A CI workflow is not included (see [recommended next steps](handoff/07-qa-docs.md)).

- What is covered, and what is not: [docs/qa/coverage.md](qa/coverage.md)
- Known failing behaviour, tracked openly: [docs/qa/defects.md](qa/defects.md)
- Checks that need a real phone: [docs/qa/push-checklist.md](qa/push-checklist.md)

## 1. Prerequisites

- Node.js 20.19 or later, `npm install` done (see [setup](setup.md), section 2).
- A **local, disposable** Postgres whose database name contains `test` (for example `flowzone_test`). Docker is the easiest way:

  ```bash
  docker run -d --name flowzone-pg-test -e POSTGRES_USER=flowzone -e POSTGRES_PASSWORD=<choose-a-password> \
    -e POSTGRES_DB=flowzone_test -p 54400:5432 postgres:17-alpine
  ```

- The Playwright browser, once: `npx playwright install chromium`.
- OpenSSL on the PATH (Git for Windows includes it). It makes the test certificate for the push stub.

## 2. Run the suite

```bash
E2E_DATABASE_URL="postgresql://flowzone:<choose-a-password>@localhost:54400/flowzone_test" npm run test:e2e
```

Windows PowerShell:

```powershell
$env:E2E_DATABASE_URL = "postgresql://flowzone:<choose-a-password>@localhost:54400/flowzone_test"
npm run test:e2e
```

What happens:

1. The config checks the database address. It refuses anything that is not `localhost` or whose name lacks `test`.
2. A push stub starts on `https://localhost:3443` (test only). Nothing leaves your machine.
3. The test server is started on `http://localhost:3100`: it applies the migrations to the test database, runs `npm run build`, then `npm run start`. The server runs with test-only settings that override your `.env.local`: test sign-in on, stand-in AI, test clock on, and a fixed tick secret. Your real AI key is ignored.
4. Every test creates its own accounts (unique names on `test.flowzone.invalid`), signs them in through the test-only login, and deletes them afterwards. The global teardown removes any account left behind.
5. Results: a list in the terminal, and an HTML report in `playwright-report/` (`npm run test:e2e:report` opens it).

Useful options:

| Option                                   | Effect                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx playwright test e2e/nudges.spec.ts` | run one file                                                                                                                                  |
| `npx playwright test --project=phone`    | phone-sized viewport only (390 x 844)                                                                                                         |
| `npx playwright test --project=desktop`  | desktop viewport only (1280 x 860)                                                                                                            |
| `npx playwright test -g "offline"`       | run tests whose names match                                                                                                                   |
| `E2E_REUSE_SERVER=1 npm run test:e2e`    | reuse a test server that is already running on port 3100 (it must have been started with the same test settings; the quickest way to iterate) |
| `E2E_PORT=3200`                          | use another port for the test server                                                                                                          |

Traces and screenshots of failures are kept in `test-results/` (git-ignored).

## 3. Test settings and why they are safe

| Setting             | Value in tests         | Why                                                                     |
| ------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `APP_ENV`           | `test`                 | the test-only login is allowed only outside production                  |
| `ENABLE_TEST_LOGIN` | `true`                 | sign in as named test users without Google                              |
| `AI_PROVIDER`       | `standin`              | deterministic replies, no quota used, refused in production             |
| `NUDGE_TEST_CLOCK`  | `true`                 | the tick endpoint accepts a test time (`?asOf=`); refused in production |
| `NUDGE_TICK_SECRET` | a fixed test value     | the scheduler's secret, for the tick tests only                         |
| `VAPID_*`           | keys made for each run | web push is set up so nudges reach the local stub                       |
| `ALLOWED_EMAILS`    | a placeholder          | test users are accepted by the test login, not by this list             |

These values are written in `e2e/support/env.ts`, which is the single place for them. The app's own safeguards still apply: the test login and test clock answer `404` on any production deployment, and the app refuses to start with them in production.

## 4. Writing a test

- Put one flow in one file under `e2e/`. Name the file for the flow, for example `e2e/capture-and-tasks.spec.ts`.
- Import `test` and `expect` from `./support/fixtures`. Use `alice` or `bob` (two fresh people), or `newPerson("label")` for more.
- Set data up through the API (`createTask`, `createProject`, `createEntry` in `e2e/support/api.ts`) rather than clicking through the UI. Use the UI for the thing the test is about.
- Prefer roles, labels and the `data-testid` hooks in [docs/contracts/design-system.md](contracts/design-system.md) (section 9) and the handoffs.
- Never weaken a test to make it pass. If a behaviour is broken, leave the test failing and record the defect (see below).
- Do not add `waitForTimeout` for correctness. Use `expect.poll` for server state and `waitForResponse` for a save.
- Use only calm wording in assertions. The helper `expectCalmWording` checks falling-behind screens for guilt or overdue words.

## 5. The helpers

| File                          | What it gives you                                                              |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `e2e/support/env.ts`          | run settings, the database guard, the test server environment, the certificate |
| `e2e/support/fixtures.ts`     | `newPerson`, `alice`, `bob`: fresh accounts, signed in, cleaned up             |
| `e2e/support/app.ts`          | `openApp`, `goTo`, `capture`, `expectCalmWording`                              |
| `e2e/support/api.ts`          | `call`, `ok`, `createTask`, `createProject`, `createEntry`, date helpers       |
| `e2e/support/push-stub.ts`    | the local push service (records every push it receives)                        |
| `e2e/support/push-decrypt.ts` | decrypts a push with the device keys, so tests can read the nudge text         |
| `e2e/support/global-setup.ts` | starts the push stub; teardown removes test accounts                           |

## 6. Known defects and test gaps

Some tests are expected to fail until a defect is fixed. They are marked with `test.fail(...)` and name the defect, so they stay visible. When the defect is fixed, the test will report as unexpectedly passing and must be changed to a normal test. Defects are listed in [docs/qa/defects.md](qa/defects.md).

## 7. Troubleshooting

| Symptom                                           | Fix                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `E2E_DATABASE_URL is not set`                     | set it to the local test database (section 2)                                             |
| `Refusing to run the tests against this database` | the host must be `localhost` and the database name must contain `test`                    |
| `openssl was not found`                           | install Git for Windows, or OpenSSL, and reopen the terminal                              |
| `browserType.launch: Executable doesn't exist`    | run `npx playwright install chromium`                                                     |
| The test server does not start within 6 minutes   | run `npm run build` by hand to see the error; check the database is running               |
| Port 3100 already in use                          | stop the other server or set `E2E_PORT`                                                   |
| `ECONNRESET` on a request                         | the helper retries once; if it persists, check that nothing else is using the test server |
