# Contributing to FlowZone

Thank you for helping. FlowZone is MIT-licensed and meant to be self-hosted, so changes should stay simple to run and easy to read. Read the [README](README.md) for the product principles first.

## Before you start

- Set up a development environment: [docs/setup.md](docs/setup.md).
- Read the contracts that cover your area. They are the rules; the code follows them:
  - [foundation](docs/contracts/foundation.md): the scoping rule, API conventions, environment variables, sign-in.
  - [api](docs/contracts/api.md), [design-system](docs/contracts/design-system.md), [ai](docs/contracts/ai.md), [nudges](docs/contracts/nudges.md).
- Skim the [architecture overview](docs/architecture.md).

## Conventions

- **TypeScript strict** everywhere. No `any` without a comment that explains why.
- **All reads and writes of a person's data go through `forUser(user)`.** Never import the raw database client. Use `userOwnedTable()` for any new table that holds a person's data.
- **Errors use the standard shape** (`src/shared/errors.ts`). Never leak database or library text to people.
- **No personal content in logs.** Log an event name, the route and a trace id. Never task text, notes, chat, names or emails.
- **Calm wording.** No "overdue", no red warnings, no points, streaks, badges or celebration. Falling behind is handled gently.
- **English only** for the interface.
- **Environment variables**: add each one to the schema in `src/server/env.ts` and to `.env.example` (with a plain comment and no value). Read settings only through `env`.
- **Migrations**: `npm run db:generate` after a schema change, commit the SQL. Never edit an applied migration; add a new one. Keep them backwards compatible with the live code.
- **Contracts**: do not change a contract to make code pass. If a contract is wrong, open an issue or discuss it first.

## Before you open a pull request

Run the checks. They must all pass:

```bash
npm run lint
npm run typecheck
npm run format:check      # or: npx prettier --write <your files>
npm run build
npm run test:e2e          # needs a local test database (docs/testing.md)
```

Add or update a Playwright test for any behaviour you change. Keep tests independent: create the data you need through the API, use the test helpers in `e2e/support/`, and never weaken an existing test to make it pass.

## Tests

- Functional tests only, with Playwright. No unit tests or API-only suites are kept, by decision of the project owner. Accessibility scans and the two-person isolation checks are part of the suite.
- The suite never uses real AI quota, real Google sign-in or a production database. See [docs/testing.md](docs/testing.md).

## Commits and pull requests

- Small, focused changes are easier to review. One concern per pull request.
- Describe what changed and why, and how you checked it. Include screenshots for visual changes if you have them.
- Do not commit secrets, `.env.local`, screenshots of personal data or test output folders.

## Reporting problems

Open an issue with the steps to reproduce, what you expected and what happened. Do not include personal data, tokens or keys in the issue. If you suspect a privacy or security problem, describe it without the details and ask for a private channel.

## Licence

By contributing you agree that your work is released under the MIT licence in [LICENSE](LICENSE).
