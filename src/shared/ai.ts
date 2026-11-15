/**
 * AI constants and reason codes shared by the server and the interface.
 * Owned by the AI agent; documented in docs/contracts/ai.md. Change a value here and
 * nowhere else. Pure constants and types: no imports.
 */

/** Why the AI cannot be used right now. Stable strings: UIs branch on them. */
export const AI_UNAVAILABLE_REASONS = ["not_opted_in", "daily_limit", "provider_down"] as const;
export type AiUnavailableReason = (typeof AI_UNAVAILABLE_REASONS)[number];

/** Risk tiers. Decided by the tool layer in code, never by the model. */
export const AI_TIERS = ["low", "confirm"] as const;
export type AiTier = (typeof AI_TIERS)[number];

/** Action log statuses. */
export const AI_ACTION_STATUSES = [
  "applied",
  "pending",
  "confirmed",
  "rejected",
  "undone",
  "expired",
  "failed",
] as const;
export type AiActionStatus = (typeof AI_ACTION_STATUSES)[number];

/** A batch of actions touching more than this many items at once needs one explicit tap. */
export const AI_CONFIRMATION_THRESHOLD = 3;

/** A pending confirmation expires after this many hours. */
export const AI_PENDING_EXPIRY_HOURS = 24;

/** Default per-person daily request cap (AI requests per calendar day in the person's time zone). */
export const AI_DEFAULT_DAILY_REQUEST_LIMIT = 30;

/** Chat: how many earlier messages are sent back to the provider with each new message. */
export const AI_CHAT_HISTORY_WINDOW = 8;
/** Chat: longest message a person may send. */
export const AI_CHAT_MAX_CHARS = 2000;
/** Chat: page size when reading history. */
export const AI_CHAT_HISTORY_PAGE = 50;
/** Chat: tool-call rounds allowed in one reply before the reply is finished. */
export const AI_CHAT_MAX_TOOL_ROUNDS = 3;

/** Context: how much of the person's data goes into a request (kept small on purpose). */
export const AI_CONTEXT_TASK_LIMIT = 6;
export const AI_CONTEXT_ENTRY_LIMIT = 3;
export const AI_CONTEXT_ENTRY_CHARS = 400;

/** Profile: limits on the human-readable profile. */
export const AI_PROFILE_MAX_ITEMS = 30;
export const AI_PROFILE_ITEM_MAX_CHARS = 200;
/** Profile: how many new proposals one refresh may add. */
export const AI_PROFILE_REFRESH_MAX = 3;

/** Feature limits. */
export const AI_CAPTURE_MAX_CHARS = 500;
export const AI_BREAKDOWN_MIN_STEPS = 2;
export const AI_BREAKDOWN_MAX_STEPS = 5;
export const AI_TODAY_MIN_ITEMS = 3;
export const AI_TODAY_MAX_ITEMS = 5;
export const AI_WORDING_MAX_CHARS = 160;

/**
 * Wording the interface may show when the AI is off or resting. Kept here so the Nudges
 * agent and the UI use the same plain fallback.
 */
export const AI_REFLECTION_FALLBACK =
  "How did today go? Write down whatever comes to mind, even a few words.";

/**
 * Words the voice rules forbid in any AI text the app shows. Matched as whole words,
 * case-insensitively. A model reply that contains one is discarded (features) or
 * replaced by the plain fallback (wording). See docs/contracts/ai.md, "Voice rules".
 */
export const AI_FORBIDDEN_PHRASES = [
  "overdue",
  "behind schedule",
  "you failed",
  "should have",
  "lazy",
  "streak",
  "you missed",
] as const;

/** The four consent switches as the AI sees them. */
export interface AiAccessView {
  features: boolean;
  notesJournal: boolean;
  profile: boolean;
}

/** The result every AI feature returns when it cannot run. */
export interface AiUnavailableView {
  available: false;
  reason: AiUnavailableReason;
}
