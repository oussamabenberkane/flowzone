# AI contract

Owner: the AI agent (Agent 4). **Read-only for everyone else.** Frontend AI and Nudges read this document and must not change it. If something here blocks you, write it in your handoff note.

Read first: [`foundation.md`](foundation.md) (user scoping, error shape, idempotent creates, environment variables) and [`api.md`](api.md) (the service layer, consent switch names, tuning constants). Everything here relies on them and does not repeat them.

Contents: [1 Provider decision](#1-provider-decision) · [2 Adapter](#2-adapter) · [3 Opt-in enforcement](#3-opt-in-enforcement) · [4 Chat](#4-chat) · [5 Context](#5-context) · [6 Tools and risk tiers](#6-tools-and-risk-tiers) · [7 Action log and confirmations](#7-action-log-and-confirmations) · [8 Profile](#8-profile) · [9 Features](#9-features) · [10 Endpoints](#10-endpoints) · [11 Reason codes and responses](#11-reason-codes-and-responses) · [12 Constants](#12-constants) · [13 Voice and prompts](#13-voice-and-prompts) · [14 Stand-in mode](#14-stand-in-mode) · [15 Data lifecycle](#15-data-lifecycle) · [16 Known limits](#16-known-limits)

---

## 1. Provider decision

**Status: Groq verified live on 2026-11-14** with the owner-supplied key: a streamed chat reply with a tool call (applied and logged), capture parsing and the reflection prompt all returned AI results. Not yet verified with the real model: the Today proposal (needs 3 or more rules candidates; it fell back correctly with 2), breakdown, fresh-look help and nudge wording. The owner must still confirm the points marked _owner check_ (free-plan limits, data settings).

Checked on **2026-11-14** from the official pages below. Where a page did not confirm a point, this says so; third-party aggregator sites were not relied on for decisions.

| Provider       | Free $0 API access                                                                                                                                                                          | Tool calling                                                                      | Structured (JSON) output                                                                                                                                                   | Streaming                   | Data use (per official pages)                                                                                                                                                                                                                                                                                                    | Decision                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Groq**       | Not confirmed on the official pages. The billing FAQ says upgrading "from the Free tier to the Developer tier" needs a payment method, which implies a card-free free tier. _Owner check._  | Confirmed: "All models hosted on Groq support tool use."                          | Confirmed for `openai/gpt-oss-20b`, `openai/gpt-oss-120b` and `qwen/qwen3.8-27b` (strict mode). Streaming and tool use are not supported together with Structured Outputs. | Assumed (OpenAI-compatible) | Retention: "By default, Groq does not retain customer data for inference requests", but inputs and outputs "may be logged for up to 30 days" for reliability or abuse; there is an opt-out in Data Controls and a Zero Data Retention option. Training use: **not confirmed** (it is in the Services Agreement / DPA, not read). | **Tentative default.**                                                                                                  |
| **Mistral**    | **Not confirmed; the official pricing page shows no API free tier.** The "Free" plan is for the Vibe app. The workspace docs say API keys are "inactive until a payment method is on file." | Confirmed (`tools`, `tool_choice`, `parallel_tool_calls`)                         | Confirmed (`response_format` json_object / json_schema)                                                                                                                    | Confirmed (SSE)             | "Model training: Opt-out" appears on the pricing table; the Free column is blank in the extracted text. Privacy policy text was not readable.                                                                                                                                                                                    | **Not workable at $0 on current official evidence.** Kept as a configuration option only if the owner finds a free key. |
| **OpenRouter** | `:free` models: **20 requests/minute**, **50 requests/day** with fewer than 10 credits, **1000 requests/day** after 10 credits are purchased.                                               | **Not confirmed** for `:free` models (the pages read did not say). _Owner check._ | Not confirmed for `:free` models.                                                                                                                                          | Assumed (OpenAI-compatible) | OpenRouter does not store prompts unless the account opts in. Whether the upstream provider trains on them depends on that provider; account settings can exclude training providers.                                                                                                                                            | **Fallback candidate.** Needs `AI_MODEL` set.                                                                           |

Sources (official pages unless marked):

- Mistral pricing: https://mistral.ai/pricing (read 2026-11-14)
- Mistral workspace quickstart: https://docs.mistral.ai/getting-started/quickstarts/admin/manage-workspaces (read 2026-11-14)
- Mistral API reference: https://docs.mistral.ai/api/ (read 2026-11-14)
- Groq rate limits: https://console.groq.com/docs/rate-limits (read 2026-11-14; states the listed figures are "the base limits for the Developer plan"; the free-plan tab did not load)
- Groq tool use: https://console.groq.com/docs/tool-use/overview (read 2026-11-14)
- Groq structured outputs: https://console.groq.com/docs/structured-outputs (read 2026-11-14)
- Groq data: https://console.groq.com/docs/your-data (read 2026-11-14)
- Groq billing FAQ: https://console.groq.com/docs/billing-faqs (read 2026-11-14)
- OpenRouter limits: https://openrouter.ai/docs/api/reference/limits (read 2026-11-14; the page contains an unrendered template placeholder for the credit threshold, so the stated 10-credit threshold is the one shown in the table)
- OpenRouter FAQ: https://openrouter.ai/docs/faq (read 2026-11-14)
- OpenRouter data collection: https://openrouter.ai/docs/guides/privacy/data-collection (read 2026-11-14)
- OpenRouter provider logging: https://openrouter.ai/docs/guides/privacy/provider-logging (read 2026-11-14)

**Chosen configuration (tentative):** `AI_PROVIDER=groq`, default model `openai/gpt-oss-20b` (tool use and strict JSON confirmed for this model).

**Risks recorded for the owner:**

1. Groq's published limit for this model family is **8,000 tokens per minute** on the Developer tier. Chat requests are kept small (see section 5) so one request fits, but a long conversation can still hit the limit. A limit hit becomes the "AI is resting" reason, not a crash.
2. Groq's limits apply to the **whole organization** (every user of the key shares them). The per-person cap in section 12 keeps two people well inside the published daily figure.
3. Groq may keep inputs and outputs for up to 30 days unless the owner turns off storage in **Data Controls**. The owner should set this before real use, and must show the first-run warning (section 3).

### 1.1 How the owner creates and sets the key

1. Create a Groq account at https://console.groq.com and create an API key on the API Keys page. Do not paste the key into the repository, a handoff note or a chat.
2. In **Data Controls** (console settings), turn off retention if you want the strictest setting, and confirm the free plan's limits on the limits page (`https://console.groq.com/settings/limits`). _Owner check._
3. Locally: put `AI_PROVIDER=groq` and `AI_API_KEY=<your key>` in `.env.local`. On Vercel: add the same two names under Project → Settings → Environment Variables (Production and Preview).
4. Restart the app. The app refuses to start if `AI_PROVIDER` names a real provider without `AI_API_KEY`.

To switch provider later: change `AI_PROVIDER`, `AI_API_KEY` and `AI_MODEL`. For a provider that is not OpenAI-compatible, add an adapter (section 2).

---

## 2. Adapter

Location: `src/server/ai/provider/`.

- `types.ts` defines the neutral interface. Nothing outside this folder knows which provider is behind it.
  - `ChatProvider.stream(request)` yields `ProviderEvent`s: `text`, `tool_call`, `usage`, `finish`.
  - `ProviderRequest`: `purpose`, `messages` (system, user, assistant with tool calls, tool results), `tools`, `json` (ask for a single JSON object), `maxTokens`, `temperature`, `signal`.
  - `AiProviderError` with a normalized `kind`: `rate_limited`, `quota`, `unavailable`, `invalid_response`. Messages never contain prompts, replies or keys.
- `openai-compatible.ts` implements the interface for any OpenAI-style chat completions endpoint (Groq, Mistral, OpenRouter). 25-second timeout. Tool-call ids are 9 letters or digits, the shape Mistral requires.
- `standin.ts` is the stand-in provider (section 14).
- `index.ts` picks the provider from configuration and holds the base URL and default model for each hosted provider.

Tool calls are **always validated by the tool layer** before anything happens. The adapter never trusts the model's arguments.

Usage (input and output tokens) is added to today's counters. Only counts are stored.

---

## 3. Opt-in enforcement

Every AI entry point calls `gateAiRequest(ctx)` in `src/services/ai/access.ts` **before** it builds any context or calls the provider. Order, always:

1. `ai_features` is on. Otherwise the reason is `not_opted_in`. Nothing is read for the AI.
2. A provider is configured. Otherwise `provider_down`.
3. The person is under today's request cap. Otherwise `daily_limit`. A request that passes is counted.

Within a permitted call, the context builder includes only what the other switches allow (section 5):

| Switch             | What it allows                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `ai_features`      | Tasks and chat, feature calls. Gates everything.                                                    |
| `ai_notes_journal` | Note and journal text in context and in profile suggestions. Off: no entry text is read for the AI. |
| `ai_profile`       | The accepted profile is read into requests; the AI may propose profile items.                       |
| `nudges`           | Not used by AI code; the Nudges agent enforces it.                                                  |

**Profile interpretation (for owner review):** the person can always list, add, edit, accept and delete their own profile items; those calls never reach a provider. What `ai_profile` gates is the AI's **use** of the profile: reading it into a request and proposing items. Turning it off stops all AI use at once.

**Action confirmation:** confirming a pending action requires `ai_features` to be on. Rejecting and undoing are always allowed, so a person can always tidy up.

Read-only history (chat, action log, profile) works with AI off, because nothing is sent to a provider.

The first-run warning wording (recommended for the Frontend AI agent) is in section 13.4.

---

## 4. Chat

- One continuous thread per person, stored in `ai_chat_messages`. Survives sessions. The person can view it, delete one message, or clear the whole thread.
- A message is saved **before** the provider is called. The reply is saved as it completes. If the provider fails part-way, partial text is kept as an incomplete message; an empty placeholder is removed. The person's own message is kept either way.
- Replies stream as **newline-delimited JSON**, one event per line:

  ```
  {"type":"start","messageId":"…"}
  {"type":"delta","text":"Added"}
  {"type":"action","action":{ …ActionCard… }}
  {"type":"done","messageId":"…"}
  {"type":"error","reason":"provider_down"}
  ```

- A tool-call round is followed by the model's final text. Up to 3 tool rounds per reply.
- Chat text is data. The system prompt says so, and every tool's arguments are validated against a schema before use.

---

## 5. Context

Built by `buildContextData` in `src/services/ai/context.ts`, sent as **one system line** beginning `CONTEXT_JSON:`, so exactly what was sent can be read back.

| Field               | Included when                                           | Contents                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `today`, `timeZone` | always                                                  | the person's date and time zone                                                                                                                                                                                                      |
| `tasks`             | `ai_features`                                           | up to 12 tasks: the 6 open tasks most recently touched, plus matches for the person's latest words (Backend full-text search). Each: `id`, `title` (≤200 chars), `status`, `dueDate`, `dueTime`, `priority`, `energy`, `projectName` |
| `entries`           | `ai_notes_journal` **and** matches for the latest words | up to 3 notes or journal entries: `id`, `kind`, `title`, `entryDate`, `excerpt` (≤400 chars)                                                                                                                                         |
| `profile`           | `ai_profile`                                            | accepted and edited profile items (up to 30). Proposed items are never sent.                                                                                                                                                         |

Chat sends the system prompt, the context line, and the last 8 completed messages. Feature calls send only the fields their purpose needs (for example, wording sends the task title and the reason, never notes).

---

## 6. Tools and risk tiers

Tools are defined in `src/services/ai/tools.ts`. Each calls the Backend service layer, so Backend rules apply once. **The tier is decided in code, never by the model.**

| Tool                   | Does                                                              | Tier                                                      | Undo                               |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `create_task`          | Create a task (optional date, time, project, priority)            | low                                                       | delete the task                    |
| `update_task`          | Change title, date, time, priority, energy or project of one task | low                                                       | restore the previous values        |
| `complete_task`        | Mark one non-repeating task done                                  | low                                                       | restore the previous status        |
| `reschedule_task`      | Move one task to a date (or remove the date)                      | low                                                       | restore the previous date and time |
| `move_to_today`        | Add tasks to today's plan (plan is not confirmed)                 | low **if the batch changes ≤ 3 items**, otherwise confirm | restore the previous plan          |
| `add_subtask`          | Add a step under a main task                                      | low                                                       | delete the step                    |
| `add_note`             | Save a note, optionally linked to a task                          | low                                                       | delete the note                    |
| `break_down_task`      | Split a main task into 1 to 10 steps                              | low                                                       | delete the steps                   |
| `propose_profile_item` | Suggest one profile item (a proposal only)                        | low; needs `ai_profile`                                   | delete the proposal                |
| `delete_task`          | Delete one task                                                   | **confirm** (always)                                      | none                               |
| `bulk_complete_tasks`  | Complete several tasks                                            | **confirm** (always)                                      | none                               |
| `edit_note`            | Change a note or journal entry                                    | **confirm** (always)                                      | none                               |
| `delete_note`          | Delete a note or journal entry                                    | **confirm** (always)                                      | none                               |

**Batch rule (code-enforced).** The tool layer counts the items each call changes (`move_to_today` counts its tasks; most others count 1). If the calls in one assistant turn together change **more than 3 items**, every change in that turn is held as pending. This implements "any change affecting more than 3 items at once". The constant is `AI_CONFIRMATION_THRESHOLD`.

**Interpretations to review:**

- Editing a note or journal entry is treated as **confirm** (the brief lists editing and deleting journal entries as confirm; notes were not listed, so the conservative choice was made).
- Repeating tasks cannot be completed from chat in v1. The person uses the task's own control. This keeps undo simple: a completion record cannot be removed through the service layer.
- A breakdown started by the person tapping "break it down" (`POST /api/ai/tasks/:id/breakdown`) runs through the same tool and is low-tier, logged and undoable.

Arguments are validated with a strict schema before anything runs. An invalid call returns an error to the model and changes nothing.

---

## 7. Action log and confirmations

- Every tool call is recorded in `ai_action_log`: tool, tier, status, a plain summary sentence, the message that caused it, and the undo instruction for applied low-tier actions.
- **Statuses:** `applied`, `pending`, `confirmed`, `rejected`, `undone`, `expired`, `failed`.
- **Pending confirmations** live in `ai_pending_confirmations` with their validated arguments and an expiry of **24 hours** (`AI_PENDING_EXPIRY_HOURS`). Confirming re-validates the stored arguments and re-checks that the target still exists. Expired items are closed when they are next read.
- **Confirm** runs the action and marks it `confirmed`. A second confirm is refused.
- **Reject** marks it `rejected`. Nothing changes.
- **Undo** reverses an `applied` low-tier action using its stored undo instruction and marks it `undone`. If the target has since gone, undo is refused with a calm message.

---

## 8. Profile

- Items in `ai_profile_items`: `text` (≤200 characters), `source` (`user` or `ai`), `status` (`proposed`, `accepted`, `edited`). Up to 30 items.
- The AI **never changes an accepted or edited item**. It can only add `proposed` items, through chat (`propose_profile_item`) or the refresh request.
- The person: adds by hand (accepted at once), edits (marked `edited`), accepts a proposal, or deletes an item. Rejecting a proposal deletes it.
- A repeat of the same text (ignoring case) returns the existing item; proposals never duplicate.
- Refresh (`POST /api/ai/profile/refresh`) needs `ai_features` and `ai_profile`. It proposes at most 3 items. Journal text is used only if `ai_notes_journal` is also on.

---

## 9. Features

Each feature passes the gate in section 3 and returns a **fallback** when the AI cannot run, so the interface can degrade gracefully.

| Feature               | Endpoint                                                                   | With AI                                                                                                     | Fallback                                                                   | Changes data?                              |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| **Capture parsing**   | `POST /api/ai/capture/parse`                                               | the model reads title, date, time, project and priority                                                     | the Backend's deterministic `parseQuickAdd` (`source: "deterministic"`)    | no; the interface saves                    |
| **Breakdown**         | `POST /api/ai/tasks/:id/breakdown`                                         | 2 to 5 steps, applied through the tool layer                                                                | `available: false` with reason; the person can break it down by hand       | yes, low tier, undoable                    |
| **Today proposal**    | `POST /api/ai/today/proposal`                                              | 3 to 5 of the rules-based candidates, each with a reason, using the energy the person chose and the profile | the rules-based list with reasons built from the rules (`source: "rules"`) | no; confirm via `PUT /api/plans/:date`     |
| **Energy matching**   | the `energy` field above                                                   | uses only the energy the person sets; never inferred                                                        | —                                                                          | —                                          |
| **Fresh-look help**   | `POST /api/ai/tasks/:id/fresh-look`                                        | up to 3 gentle options: reschedule (a future date), simplify (a shorter title), breakdown                   | the rules options (reschedule to tomorrow, break down)                     | no; nothing changes until the person picks |
| **Wording**           | function `generateNudgeWording` (for Nudges) and `POST /api/ai/reflection` | a short message of at most 160 characters that includes the concrete reason                                 | `text: null, source: "none"` → the caller uses its fixed template          | no                                         |
| **Reflection prompt** | `POST /api/ai/reflection`                                                  | one open, kind question                                                                                     | a fixed prompt (always returns text)                                       | no                                         |

**Wording rules (code-enforced):** text is accepted only if it is at most 160 characters, contains no forbidden phrase (section 13), and contains the given reason. Otherwise the template is used.

**Nudges use.** `generateNudgeWording(ctx, { taskId, reason })` honors `ai_features` and sends the task title and the reason only, never notes. The Nudges agent must still check its own `nudges` switch and quiet hours before calling it.

---

## 10. Endpoints

All endpoints need a signed-in, allowed person (`userRoute`). Errors use the standard shape (`foundation.md` section 6). AI reasons come back as **200 with `available: false`**, not as errors, so a resting AI is never shown as a failure. Responses carry `Cache-Control: private, no-store`.

| Method and path                     | Body                              | Response                                                                                                    |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/ai/status`                | —                                 | `{ switches: {features, notesJournal, profile}, available, reason, provider, model, usage: {used, limit} }` |
| `GET /api/ai/chat`                  | —                                 | `{ messages: [{id, role, content, complete, createdAt}] }` (last 50, oldest first). Works with AI off.      |
| `DELETE /api/ai/chat`               | —                                 | `{ cleared: n }`. The action log is kept.                                                                   |
| `POST /api/ai/chat/messages`        | `{ text }` (1 to 2000 characters) | **Stream** (NDJSON, section 4), or `{ available: false, reason }`                                           |
| `DELETE /api/ai/chat/messages/:id`  | —                                 | 204 · 404                                                                                                   |
| `GET /api/ai/actions`               | —                                 | `{ actions: [ActionCard] }` (50 most recent)                                                                |
| `GET /api/ai/actions/pending`       | —                                 | `{ actions: [ActionCard] }` (expired ones are closed)                                                       |
| `POST /api/ai/actions/:id/confirm`  | —                                 | `{ action }` · 409 if not pending, expired or AI is off                                                     |
| `POST /api/ai/actions/:id/reject`   | —                                 | `{ action }` · 409 if not pending                                                                           |
| `POST /api/ai/actions/:id/undo`     | —                                 | `{ action }` · 409 if not undoable                                                                          |
| `GET /api/ai/profile`               | —                                 | `{ items: [ProfileItem] }`                                                                                  |
| `POST /api/ai/profile`              | `{ text }`                        | 201 `ProfileItem` (accepted, source `user`)                                                                 |
| `PATCH /api/ai/profile/:id`         | `{ text }`                        | `ProfileItem` (status `edited`)                                                                             |
| `POST /api/ai/profile/:id/accept`   | —                                 | `ProfileItem`                                                                                               |
| `DELETE /api/ai/profile/:id`        | —                                 | 204 (deletes an item or rejects a proposal)                                                                 |
| `POST /api/ai/profile/refresh`      | —                                 | `{ available: true, proposed: [ProfileItem] }` or `{ available: false, reason }`                            |
| `POST /api/ai/capture/parse`        | `{ text }` (1 to 500 characters)  | `{ source, reason, parsed: QuickAddView }`                                                                  |
| `POST /api/ai/tasks/:id/breakdown`  | —                                 | `{ available: true, task: TaskDetailView, card }` or `{ available: false, reason }`                         |
| `POST /api/ai/tasks/:id/fresh-look` | —                                 | `{ source, reason, options: [...] }`                                                                        |
| `POST /api/ai/today/proposal`       | `{ energy? }`                     | `{ source, reason, items: [{ task, reason }] }`                                                             |
| `POST /api/ai/reflection`           | —                                 | `{ source: "ai" \| "fallback", reason, text }`                                                              |

`ProfileItem`: `{ id, text, source, status, createdAt, updatedAt }`. `ActionCard`: `{ id, tool, tier, status, summary, canUndo, expiresAt, createdAt }`.

---

## 11. Reason codes and responses

Stable strings. Clients branch on them.

| Reason          | Meaning                                                                          | Suggested message for the person                             |
| --------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `not_opted_in`  | `ai_features` is off                                                             | hide the AI features, or a quiet invitation to turn them on  |
| `daily_limit`   | today's cap is reached                                                           | "AI is resting until tomorrow. Everything else still works." |
| `provider_down` | no provider configured, provider unreachable, rate limited, or an unusable reply | "AI is resting for now. Everything else still works."        |

---

## 12. Constants

All in `src/shared/ai.ts` (AI-owned). Change them there and nowhere else.

| Constant                                                                        | Value        | Meaning                                                 |
| ------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| `AI_CONFIRMATION_THRESHOLD`                                                     | 3            | a batch changing more items than this waits for one tap |
| `AI_PENDING_EXPIRY_HOURS`                                                       | 24           | a pending confirmation expires after this               |
| `AI_DEFAULT_DAILY_REQUEST_LIMIT`                                                | 30           | default cap; overridden by `AI_DAILY_REQUEST_LIMIT`     |
| `AI_CHAT_HISTORY_WINDOW`                                                        | 8            | earlier messages sent with each new message             |
| `AI_CHAT_MAX_CHARS`                                                             | 2000         | longest message                                         |
| `AI_CHAT_MAX_TOOL_ROUNDS`                                                       | 3            | tool-call rounds per reply                              |
| `AI_CONTEXT_TASK_LIMIT` / `AI_CONTEXT_ENTRY_LIMIT` / `AI_CONTEXT_ENTRY_CHARS`   | 6 / 3 / 400  | context size                                            |
| `AI_PROFILE_MAX_ITEMS` / `AI_PROFILE_ITEM_MAX_CHARS` / `AI_PROFILE_REFRESH_MAX` | 30 / 200 / 3 | profile limits                                          |
| `AI_BREAKDOWN_MIN_STEPS` / `AI_BREAKDOWN_MAX_STEPS`                             | 2 / 5        | AI breakdown size (the tool itself allows 1 to 10)      |
| `AI_TODAY_MIN_ITEMS` / `AI_TODAY_MAX_ITEMS`                                     | 3 / 5        | Today proposal size                                     |
| `AI_WORDING_MAX_CHARS`                                                          | 160          | longest nudge wording                                   |
| `AI_CAPTURE_MAX_CHARS`                                                          | 500          | longest capture text                                    |

**Daily cap** is per person per day in **their** time zone. It counts AI requests that pass the gate (chat messages and feature calls). Tool follow-up rounds are not counted separately.

Provider model names: Groq `openai/gpt-oss-20b`; Mistral `mistral-small-latest`; OpenRouter has no default (`AI_MODEL` required).

---

## 13. Voice and prompts

All prompts are in `src/server/ai/prompts.ts`.

### 13.1 Voice rules

Plain, warm, brief and calm. English only. No mascot, no persona, no emoji, no exclamation marks. Never scold, guilt or pressure. Offer options; never decide for the person.

**Forbidden phrases** (whole words, case-insensitive; `AI_FORBIDDEN_PHRASES`): `overdue`, `behind schedule`, `you failed`, `should have`, `lazy`, `streak`, `you missed`. The word "overdue" is never shown to a person.

Enforcement: feature replies and wording that contain a forbidden phrase are discarded and the fallback is used. Chat replies are instructed by the system prompt; streamed text cannot be filtered in full, so this is a prompt rule, not a guarantee, for chat.

### 13.2 Prompt-injection resistance

Context, the person's messages and tool results are described to the model as **data**. Only the person's own chat message asks for changes. The model may use only task ids that appear in the context or that a tool returned. Tool arguments are always validated, and the tier cannot be changed by the model.

### 13.3 Where prompts live

One file: `src/server/ai/prompts.ts` (`VOICE_RULES`, `DATA_RULES`, `chatSystemPrompt`, `PURPOSE_PROMPTS`, `forbiddenPhraseIn`).

### 13.4 Recommended first-run warning (for Frontend AI)

> **Before you use AI:** when you ask FlowZone's assistant something, the text you send, and the parts of your tasks and (if you allow it) notes that it needs, are sent to the AI provider that FlowZone's host has set up. The free provider may use what is sent to improve its models. You can turn AI off or limit what it can see at any time in Settings. Without AI, FlowZone works as a normal to-do app.

---

## 14. Stand-in mode

`AI_PROVIDER=standin` replaces the provider with deterministic replies that run through **the same tool layer**, so tiers, the action log and undo are really exercised. It spends no quota. It is **refused in production** at startup (`src/server/env.ts`).

It reads task ids from the `CONTEXT_JSON:` line.

### 14.1 Chat trigger phrases (the whole message, case-insensitive)

| Message                      | Result                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `add <title>`                | `create_task` (low, applied, undoable)                                            |
| `note <text>`                | `add_note` (low, applied, undoable)                                               |
| `complete <title>`           | `complete_task` (low, applied, undoable) — the title must match a task in context |
| `delete <title>`             | `delete_task` (confirm, **pending**)                                              |
| `bulk complete`              | `bulk_complete_tasks` over open tasks in context (confirm, **pending**)           |
| `plan my day` / `plan today` | `move_to_today` for 2 open tasks (low, applied)                                   |
| `plan all`                   | `move_to_today` for 4 open tasks (confirm, **pending**: more than 3 items)        |
| `break down <title>`         | `break_down_task` with 3 steps (low, applied, undoable)                           |
| `remember <text>`            | `propose_profile_item` (low; **refused** when `ai_profile` is off)                |
| `error`                      | provider unavailable → `{"type":"error","reason":"provider_down"}`                |
| `rest`                       | provider rate limited → calm "AI is resting" error                                |
| anything else                | a plain reply listing what it can do                                              |

### 14.2 Feature replies (by purpose)

| Purpose    | Reply                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| capture    | `title` = the text; `dueDate` = tomorrow when the text contains "tomorrow"          |
| breakdown  | 3 steps                                                                             |
| today      | the first 3 rules candidates, each with a fixed reason                              |
| fresh_look | 3 options: reschedule to tomorrow, simplify (first 3 words of the title), breakdown |
| profile    | `"Works best in the mornings"`                                                      |
| wording    | a text containing the task title and the given reason                               |
| reflection | one fixed question                                                                  |

Tests should rely on these phrases and outputs.

---

## 15. Data lifecycle

Registered in `LIFECYCLE_HANDLERS` (`src/services/lifecycle/registry.ts`) as handler `ai`. Export: `ai/chat.json`, `ai/chat.md`, `ai/actions.json` (no undo internals), `ai/profile.json`, `ai/profile.md`, `ai/usage.json`. Deletion removes all five AI tables for the person.

Tables (migration `drizzle/0002_ai_tables.sql`): `ai_chat_messages`, `ai_action_log`, `ai_pending_confirmations`, `ai_profile_items`, `ai_usage_counters`. All are user-owned and reached only through `forUser()`.

---

## 16. Known limits

- **Only Groq has been exercised, and only for chat, capture and reflection.** Today, breakdown, fresh-look and wording with the real model are still unverified. Groq reasoning models need `reasoning_effort: low` and larger output budgets (set in code); other providers are untested.
- Model quality is not assessed. Breakdown, Today ranking and wording are validated for shape, length and forbidden words, not for usefulness.
- The daily cap is checked and then incremented, so two simultaneous requests can exceed it by one. Acceptable for a two-person app.
- Chat can, in principle, produce a forbidden word that is streamed before the check; the prompt forbids it, but streaming cannot be filtered in full.
- Repeating tasks cannot be completed from chat in v1 (section 6).
- The action log stores plain summaries that include task titles, because they are the person's own data. They are never written to server logs.
- Tokens: the per-minute cap of the chosen free model is small. Long conversations are trimmed to the last 8 messages and the top context items.
