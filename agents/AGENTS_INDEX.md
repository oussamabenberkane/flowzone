# FlowZone — Agents Index

FlowZone is a personal, AI-assisted, ADHD-friendly todo web app (Next.js, TypeScript, Postgres, Vercel free tier). Seven agents build it. Each agent file is self-contained: give an agent **only its own file** (plus the repository as it currently stands) and let it work. Run them **one at a time, in order**. After each run, do the checkpoint below before starting the next.

## Run order

| # | File | Agent | Needs before it runs | Checkpoint (verify before continuing) |
|---|---|---|---|---|
| 1 | `AGENT_FOUNDATION.md` | Foundation | Google OAuth credentials, a Vercel account, approval for the first push | App deployed on Vercel; Google sign-in works for the two allowed accounts and refuses others; health endpoint OK |
| 2 | `AGENT_BACKEND.md` | Backend | Agent 1 done | `docs/contracts/api.md` exists; seed script works; handoff note lists default values to review |
| 3 | `AGENT_FRONTEND_CORE.md` | Frontend Core | Agent 2 done | The app works end to end as a normal todo app, installable, offline capture works, light and dark themes |
| 4 | `AGENT_AI.md` | AI | Agent 2 done (Agent 3 not required by it) | You created the AI provider key; `docs/contracts/ai.md` records the provider decision; stand-in mode documented |
| 5 | `AGENT_FRONTEND_AI.md` | Frontend AI | Agents 3 and 4 done | First-run opt-in, chat, Settings, profile work; app still fine with all switches off |
| 6 | `AGENT_NUDGES.md` | Nudges | Agents 2, 3, 4, 5 done | GitHub repository secrets added; push works on Android and Windows Chrome; iPhone result recorded |
| 7 | `AGENT_QA_DOCS.md` | QA & Docs | Agents 1–6 done | Full Playwright suite passes; coverage matrix and defect log reviewed; docs let a new developer set up the app |

## Parallelism (optional; you plan to run one at a time)
- Agents **3 and 4** can run in parallel after Agent 2 (they depend only on Agent 2 and touch different areas).
- Everything else is strictly sequential. Agent 6 (Nudges) must wait for Agent 5 because it fills the Settings screen's notifications section that Agent 5 builds.
- If you run two at once, give each its own git branch (or worktree) to avoid collisions, then merge.

## Shared contracts (single owner each; others read only)

| Contract / document | Owner | Location |
|---|---|---|
| User scoping, error-response convention, idempotency convention, table conventions, test-only login, environment-variable convention | Foundation | `docs/contracts/foundation.md` |
| Core database schema, core REST API, consent switch names, tuning constants, data lifecycle registry (export and delete), quick-add parser | Backend | `docs/contracts/api.md` |
| Design system, motion and copy rules, UI extension points | Frontend Core | `docs/contracts/design-system.md` |
| Provider decision, adapter, AI endpoints, tools and risk tiers, reason codes, stand-in AI mode, voice rules | AI | `docs/contracts/ai.md` |
| Nudge rules, tick endpoint and its security, test-only time parameter, notification format | Nudges | `docs/contracts/nudges.md` |
| Tests, coverage matrix, defect log, developer docs | QA & Docs | `docs/qa/`, README and setup docs |

Each agent writes a handoff note in `docs/handoff/` (`01-foundation.md` … `07-qa-docs.md`). The AI and Nudges agents own the tables for their own domains, following Backend's conventions, and register their export and delete handlers with Backend's registry.

## Key decisions every agent follows
- Individual users only (two accounts now), completely isolated data. No collaboration.
- All AI is opt-in via four switches, off by default: `ai_features`, `ai_notes_journal`, `ai_profile`, `nudges`. With none enabled it is a normal todo app.
- Never guilt: no "overdue" wording, no streaks, points or badges, no pressure.
- AI acts only on the user's chat requests, with risk-tiered confirmation and undo.
- Web push only; English only; $0 budget (Vercel free tier, free AI provider); no third-party analytics.
- Testing is Playwright only, owned by the QA & Docs agent.
- Frontend agents (3, 5, and the UI parts of 6) use the `frontend-design` skill if available.
- Agents do not push to GitHub or change repository settings without the owner's approval.

## Things you must prepare or do yourself
1. Google OAuth credentials and the allow-list of the two emails (Agent 1).
2. A Vercel project and the Marketplace Postgres database (Agent 1).
3. Approval for the first push to GitHub (Agent 1).
4. The free AI provider API key (Agent 4).
5. Repository secrets and Vercel environment variables for the scheduler and push keys (Agent 6).
6. Real-device push checks on iPhone, Android and Windows (Agents 6 and 7).
7. Consider moving the project out of OneDrive, or excluding dependency and build folders from sync.
