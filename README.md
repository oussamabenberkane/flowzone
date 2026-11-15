# FlowZone

A calm personal productivity app for people with ADHD or focus struggles. Tasks come first. Notes, a journal and an optional AI assistant support them. Nothing is ever a red alarm, and nothing shames you for a day that went differently.

FlowZone is an installable, mobile-first web app. It is English only, has light and dark themes, and is open source under the [MIT licence](LICENSE). You can self-host it with your own Google account and database.

## Principles

- **Calm, never guilt-inducing.** No "overdue", no red states, no streaks, points, badges or confetti. A task you have not touched for a while is simply offered again, gently.
- **Low friction.** Capture a thought in plain language in one tap, from anywhere. It goes to your Inbox, and you sort it later.
- **Tasks are the foundation.** Everything else is there to help them, not to compete with them.
- **AI is opt-in.** Four switches, all off by default. With everything off, FlowZone is a normal todo app: no AI surface appears at all.
- **Your data is yours.** Sign-in is closed to the addresses you list. Export everything, or delete your account and all data, at any time.
- **Works offline.** Capture works without a connection and is sent exactly once when you are back. Today opens from a saved copy.

## Features

- **Quick capture** from anywhere, with plain-language input (`Call Sam tomorrow at 5pm #Work !high`). Every field can be corrected before saving.
- **Inbox** for anything not yet sorted, plus **projects**.
- **Tasks** with due dates and times, priority, energy, time estimates, subtasks (one level), repeating schedules (daily, every few days, weekly, monthly, pausable) and three statuses (pending, in progress, completed).
- **Today**: a short list you choose. An optional, dismissible "plan my day" prompt appears once a day.
- **Focus mode**: one task and its current step, an optional timer that is off until you start it, and "park a thought" that saves a note linked to the task.
- **Falling behind, gently**: a calm "fresh look" list with simple options (tomorrow, next week, no date, break it down, let it go). A repeating task that you skip is not piled up; after a few skips it asks whether to adjust or pause it.
- **Notes and journal**: one kind of entry with two starting points. An optional end-of-day reflection is saved as a journal entry.
- **Nudges** (optional): gentle reminders, at most three a day, quiet at night, and each one says why. You can mute or snooze a task's nudges. Notifications arrive on devices you allow.
- **AI assistant** (optional): a chat that can add and plan tasks, write notes and break tasks into steps. Small changes apply at once with undo. Anything bigger (deleting, bulk completion, moving more than three items) waits for your yes. A profile of things that matter to you is only ever changed by you.
- **Settings**: quiet hours, time zone, text size, a dyslexia-friendly font, less motion, export, and account deletion.
- **Accessibility**: keyboard use, visible focus, reduced motion, large text, and automated checks on every screen in both themes.

## Quick start

For a full walkthrough (Google sign-in, database, deployment, keys), read **[docs/setup.md](docs/setup.md)**.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see docs/setup.md)
npm run db:migrate
npm run dev                     # http://localhost:3000
```

Run the tests with a local test database (see [docs/testing.md](docs/testing.md)):

```bash
E2E_DATABASE_URL="postgresql://…/flowzone_test" npm run test:e2e
```

## Documentation

| Document                                               | For                                             |
| ------------------------------------------------------ | ----------------------------------------------- |
| [docs/setup.md](docs/setup.md)                         | setting up, running and deploying your own copy |
| [docs/architecture.md](docs/architecture.md)           | how the parts fit together                      |
| [docs/testing.md](docs/testing.md)                     | running and writing the Playwright suite        |
| [CONTRIBUTING.md](CONTRIBUTING.md)                     | conventions and how to send a change            |
| [docs/qa/coverage.md](docs/qa/coverage.md)             | which requirements the tests cover              |
| [docs/qa/defects.md](docs/qa/defects.md)               | known issues and their owners                   |
| [docs/qa/push-checklist.md](docs/qa/push-checklist.md) | the checks that need a real phone               |
| [docs/contracts/](docs/contracts/)                     | the rules each part is built to                 |

## Status

FlowZone is an early version. Some checks need real devices and real accounts before it is considered finished; they are listed in the defect log and the push checklist, not hidden.

## Licence

MIT. See [LICENSE](LICENSE).
