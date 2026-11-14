# FlowZone — Execution Order

Run the agents **one at a time, in this order**. Give each agent only its own file from this folder. Do the "before" items first and the "check" items after, and only continue when the check passes.

## The order

### 1. `AGENT_FOUNDATION.md`
- **Before:** create Google OAuth credentials, a Vercel account, and know the two emails to allow.
- **Check:** app is deployed on Vercel; Google sign-in works for the two allowed accounts and refuses others; the health endpoint is OK.
- **Note:** it will ask your approval before the first push to GitHub.

### 2. `AGENT_BACKEND.md`
- **Before:** Agent 1 done.
- **Check:** `docs/contracts/api.md` exists; the seed script works; the handoff note lists default values for you to review.

### 3. `AGENT_FRONTEND_CORE.md`
- **Before:** Agent 2 done.
- **Check:** the app works end to end as a normal todo app, is installable, offline capture works, light and dark themes look right.

### 4. `AGENT_AI.md`
- **Before:** Agent 2 done. Be ready to create the free AI provider API key it tells you to make.
- **Check:** `docs/contracts/ai.md` records the provider decision; the stand-in AI mode is documented.

### 5. `AGENT_FRONTEND_AI.md`
- **Before:** Agents 3 and 4 done.
- **Check:** first-run opt-in, chat, Settings and the profile work; the app is still fully usable with every switch off.

### 6. `AGENT_NUDGES.md`
- **Before:** Agents 2, 3, 4 and 5 done. Be ready to add the GitHub repository secrets and Vercel environment variables it lists.
- **Check:** push arrives on Android Chrome and Windows Chrome; the iPhone result is recorded honestly.

### 7. `AGENT_QA_DOCS.md`
- **Before:** Agents 1 to 6 done.
- **Check:** the full Playwright suite passes; review the coverage matrix and defect log; the docs let a new developer set up the app.

## Can anything run in parallel?
Only **Agents 3 and 4**, after Agent 2 is done. They depend only on Agent 2 and touch different areas. If you do this, give each its own git branch and merge afterwards. Everything else must stay in order, because each later agent builds on the previous one's contracts and code.

## Dependency summary

```
1 Foundation -> 2 Backend -> 3 Frontend Core --\
                         \-> 4 AI ---------------> 5 Frontend AI -> 6 Nudges -> 7 QA & Docs
```

Agent 5 needs both 3 and 4. Agent 6 needs 5 because it fills the Settings screen's notifications section. Agent 7 needs everything.

## Reference
`AGENTS_INDEX.md` in this folder lists the contract owners and the key decisions all agents follow.
