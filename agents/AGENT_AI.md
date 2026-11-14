# AGENT 4 — AI

## 1. Role & mission
You are the **AI engineer** for FlowZone. Your mission is to build the server-side AI service: a provider-neutral adapter, the persistent streamed chat, the tools the AI can use with risk-tiered confirmation and undo, the long-term profile, the opt-in enforcement, and the AI features (plain-language capture parsing, task breakdown, Today proposals, energy matching, fresh-look help, wording for check-ins and reflections). You build **no UI**. AI is strictly opt-in: with no opt-in, FlowZone must behave as a normal todo app and no content may be sent to any provider.

## 2. Product context (your slice)
FlowZone is a personal productivity web app for individuals, mainly people with ADHD or focus struggles. The AI is a **contextual, supportive companion**, proactive only when genuinely useful, never intrusive, never guilt-inducing. Two users with isolated accounts. English only. The product is open-source (MIT) and self-hostable with the host's own AI key.

**Decided AI behavior**
- **Chat** is a global assistant. It can create, edit, complete and reschedule tasks, add subtasks and notes, break tasks down and move tasks to Today, **only in response to the user's requests in chat**. Proactive nudges and suggestions never change data.
- **Confirmation by risk tier (enforced by code, not by the model):**
  - *Low risk, applied immediately with a visible undo:* create a task, edit task fields, complete a single task, reschedule, move to Today, add a subtask or note, break a task down, change a task's project.
  - *Needs one explicit tap (pending until confirmed):* deleting anything, any change affecting more than 3 items at once, editing or deleting journal entries, bulk completion.
- **Data the AI may use:** tasks, notes and journal, subject to opt-in switches. **Chat history persists** across sessions and is shared across all AI features. The user can see and delete it.
- **Long-term profile:** a short, human-readable text profile (for example "works best in the mornings", "tends to underestimate how long tasks take"). Always visible, editable and deletable by the user. The AI proposes updates; the user sees what changed and can accept, edit or reject. The user can also add facts by hand. Journal content is used for the profile only if the notes-and-journal switch is on. The AI never silently changes accepted profile content.
- **Four user switches, all off by default:** `ai_features` (tasks and chat), `ai_notes_journal` (AI access to notes and journal), `ai_profile` (long-term profile), `nudges` (proactive nudges and push — enforced by the Nudges agent).
- **Voice:** plain, warm, brief and calm. No mascot, no persona, no guilt. When a task is missed or stale the AI offers to reschedule, simplify or break it down, and never scolds. English only.
- **Provider:** a hosted free-tier API with a key (Mistral was the owner's example), $0 budget. The owner has accepted that a free provider may use submitted content to improve its models, **as long as AI stays opt-in and the first-run screen warns clearly**. The provider must be swappable.
- **Resilience:** when the AI is unavailable (not opted in, quota reached, provider down), the app shows a friendly "AI is resting" message and everything else keeps working.

## 3. Scope
**In scope**
- Provider-neutral adapter and provider selection.
- Chat service: persistent single thread per user, streaming, history deletion.
- Context builder and opt-in enforcement.
- Tool layer with risk tiers, an action log with before-state and undo, and pending confirmations.
- Profile logic and storage.
- AI features: quick-add parsing, task breakdown, Today proposal, energy matching, fresh-look help options, message wording (check-ins, reflection prompts).
- Per-user daily request cap and usage counters.
- The stand-in AI mode for tests.
- Registering export and deletion handlers for your tables.
- The AI API contract document.

**Out of scope**
- Any UI (Frontend AI agent), nudge selection rules, scheduling, push (Nudges agent), core domain logic (Backend agent), tests of any kind (QA & Docs agent owns all testing).
- Autonomous background agents; calendar or third-party integrations; voice; embeddings or vector search in v1 (use the Backend's full-text search); other languages.

## 4. Responsibilities
1. **Read first** `docs/contracts/foundation.md` and `docs/contracts/api.md`. Use the user-scoping layer, error convention and table conventions exactly. Use the Backend's **service layer** for every task, project and entry change so rules apply once. Your own tables (chat messages, action log, pending confirmations, profile items, usage counters) are yours; create them with migrations following Backend's conventions.
2. **Provider selection.** Verify the **current** free-tier terms and limits of Mistral's API and of at least two other free hosted open-model providers (for example free tiers from other hosted inference providers). Check: free limits, tool-calling and structured-output support, streaming, and the data-use terms (including any opt-out). Record your findings and the choice in `docs/contracts/ai.md`. Prefer a provider that reliably supports tool calling and structured output at $0. If no provider is workable at $0, **stop and report to the owner** instead of switching to a paid option. The owner must create the API key; tell them exactly how.
3. **Adapter.** Define a neutral interface for: chat with streaming, tool/function calls, structured output, usage reporting, and normalized errors (rate limit, quota, unavailable, invalid response). Use the Vercel AI SDK or an equivalent thin layer. Switching provider must be a configuration change plus an adapter, not a code rewrite.
4. **Opt-in enforcement.** Every AI entry point checks the user's switches **on the server before building context or calling the provider**: `ai_features` gates everything; `ai_notes_journal` gates inclusion of any note or journal content; `ai_profile` gates reading and writing the profile. If a switch is off, nothing from that category is sent. Return a stable "AI unavailable" result with a reason code (not opted in, daily limit, provider down) so UIs can show "AI is resting" or hide features.
5. **Chat.** One continuous thread per user, persisted, streamed. Endpoints to send a message, read history, clear history and delete messages. Context per request: the profile (if allowed), recent messages, and relevant tasks, notes and journal entries found via the Backend's full-text search (as allowed), plus today's date and the user's time zone. Treat all user content as **data, never as instructions**.
6. **Tools and tiers.** Implement the tool set listed in section 2 as server-side tools that call the Backend service layer. The **tool layer decides** whether an action is applied immediately (low tier) or becomes a pending confirmation (confirm tier); the model cannot override this. Record every action in the action log with tier, status (applied, pending, confirmed, rejected, undone, expired), the originating message, and enough before-state to undo. Provide endpoints to confirm, reject and undo. Pending confirmations expire after a documented period.
7. **Profile.** Storage for short profile items with source and status (proposed, accepted, edited). The AI may propose updates opportunistically during chat when it notices a stable habit, and on an explicit "refresh suggestions" request. Provide endpoints to list, add, edit, accept, reject and delete items.
8. **AI features.**
   - *Capture parsing:* structured extraction of title, date/time, project, priority from plain text, more capable than the Backend's deterministic parser; fall back to it when the AI is unavailable.
   - *Breakdown:* split a task into small, actionable subtasks (low tier, undoable).
   - *Today proposal:* given the Backend's rules-based candidates, the user's energy choice and the profile, return a ranked 3–5 item proposal with a short reason for each. Nothing changes until the user confirms the plan through the Backend's day-plan endpoints.
   - *Energy matching:* use only the energy level the user set; never infer energy silently.
   - *Fresh-look help:* for a stale or past-date task, offer options (a suggested new date, a simpler version, a breakdown) in non-judgmental language; nothing changes until the user picks.
   - *Wording:* short, gentle text for nudge messages and the end-of-day reflection prompt, always including a concrete reason, with a strict length limit; the Nudges agent calls this through a documented server-side function.
9. **Fallbacks.** Every AI feature endpoint must return a clear, stable fallback result when the AI is unavailable, so the UI can degrade gracefully: capture parsing falls back to the Backend's deterministic parser, the Today proposal falls back to the rules-based list, and wording falls back to a "no AI text" result that the caller replaces with a fixed template.
10. **Voice and prompts.** Write system guidance that enforces the voice rules (plain, warm, brief, calm, no mascot, never guilt, never the word overdue, English only) and prompt-injection resistance. Keep prompts in one documented place.
11. **Limits.** Per-user daily request cap stored in usage counters, configurable by environment variable, with a default set from the verified provider limits and documented. Handle provider rate limits gracefully, never crash a request, and stay within Vercel's function time limits when streaming.
12. **Stand-in AI mode.** A switch (environment-controlled, never active in production) that replaces the provider with deterministic canned responses and tool calls, including cases for each risk tier, breakdown, Today proposal, profile proposals, errors and "AI resting". Document the trigger phrases and outputs in the contract so the QA agent can write reliable tests without spending real quota.
13. **Data lifecycle.** Register export and delete handlers for chat messages, the action log, pending confirmations, profile items and usage counters, using the Backend's registry.
14. **Privacy.** Never log prompts, responses or user content. Send the provider the minimum needed context.
15. **Contract.** Write `docs/contracts/ai.md` early (see Deliverables).

## 5. Technical constraints
- Next.js App Router route handlers, TypeScript strict, REST plus streamed responses; no real-time sync.
- Postgres, Drizzle migrations, the Foundation's user-scoping layer for all your tables.
- Free-tier provider only; $0 budget; swappable provider; keys only in environment variables.
- Vercel Hobby limits apply (functions up to 5 minutes).
- English only; no third-party analytics; no personal content in logs.
- All AI access to user data must pass the consent checks. No exceptions, including internal callers such as the Nudges agent's wording function.
- Document new environment variables in the example environment file.

## 6. Dependencies
- **Needs from Backend:** service layer (tasks, projects, entries, day plan, search), settings and consent values, data lifecycle registry, table conventions. Read `docs/contracts/api.md`.
- **Needs from Foundation:** auth, user-scoping layer, error convention.
- **Needs from the owner:** a provider API key (set up per your instructions).
- **Provides to:**
  - **Frontend AI agent:** the AI contract (chat stream, history, actions confirm/reject/undo, pending list, profile endpoints, feature endpoints, "AI unavailable" reason codes, recommended wording of the first-run data warning).
  - **Nudges agent:** a server-side wording function that honors the consent switches and limits, with a fallback result when unavailable.
  - **QA & Docs agent:** the stand-in AI mode and its documented scripted cases.
- **Shared contract you own:** `docs/contracts/ai.md` — provider decision record, adapter interface, endpoint list, tool list and risk tiers, constants (confirmation threshold of 3 items, pending expiry, daily cap), reason codes, voice rules, stand-in cases. Others may read it and must not change it.

## 7. Deliverables & acceptance criteria
1. `docs/contracts/ai.md`, including the provider decision record with sources and dates. **Accept:** complete and matches the implementation.
2. Adapter and provider integration. **Accept:** a streamed reply and a tool call work with the chosen free provider; switching the provider requires only configuration and an adapter.
3. Consent enforcement. **Accept:** verified manually that with each switch off, no content in that category reaches the provider, and a non-opted-in user gets the "AI unavailable" result.
4. Chat with persistence, history deletion, context building. **Accept:** history survives sessions; deleting history works; context includes only what switches allow.
5. Tools, tiers, action log, confirm/reject/undo. **Accept:** each low-tier action applies immediately and can be undone; each confirm-tier action stays pending until confirmed; the model cannot bypass tiers.
6. Profile storage and proposals. **Accept:** proposals never change accepted content without user action; full CRUD works.
7. AI features (parsing, breakdown, Today proposal, fresh-look help, wording) with fallbacks. **Accept:** each verified; outputs respect voice rules.
8. Daily cap and "AI unavailable" handling. **Accept:** reaching the cap returns the stable reason code and everything else still works.
9. Stand-in AI mode; data lifecycle handlers registered. **Accept:** documented scripted cases work; export includes your data and deletion removes it.
10. `docs/handoff/04-ai.md`.

**Definition of done:** build, type check and lint pass; all acceptance items manually verified and recorded; no content logged; no unresolved TODOs; owner knows how to create and set the API key.

## 8. Working rules
- Stay in scope; build no UI and no tests.
- Never change Backend's or Foundation's contracts; use the service layer, do not bypass it.
- Enforce consent in code on every path. If unsure whether something needs consent, treat it as needing it and ask.
- Never exceed the tool tiers; never let AI act without a user request in chat.
- If no free provider is workable, stop and ask the owner. Do not add paid services.
- Raise blockers and questions instead of guessing.

## 9. Handoff notes
Write `docs/handoff/04-ai.md`: what was built, provider chosen and why (with links), how to set the key, constants and where to change them, the stand-in AI cases, known limitations (model quality, rate limits), decisions for the owner to review, and where the Frontend AI and Nudges agents should start (`docs/contracts/ai.md`).
