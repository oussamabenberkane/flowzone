import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userOwnedTable } from "../user-owned-table";

/**
 * AI tables (owned by the AI agent). Contract: docs/contracts/ai.md.
 *
 * Status and kind columns are plain text, checked in TypeScript (see src/shared/ai.ts).
 * Nothing here is ever logged: chat text and action summaries are the person's own data.
 */

/** Chat thread: one continuous list of messages per person. */
export const aiChatMessages = userOwnedTable(
  "ai_chat_messages",
  {
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    /** Plain text as the person wrote it, or the assistant's reply. */
    content: text("content").notNull().default(""),
    /** False while an assistant reply is still streaming or if it failed part-way. */
    complete: boolean("complete").notNull().default(true),
  },
  (t) => [index("ai_chat_messages_user_created_idx").on(t.userId, t.createdAt)],
);

/** Every action the AI took or proposed, with what is needed to undo it. */
export const aiActionLog = userOwnedTable(
  "ai_action_log",
  {
    messageId: uuid("message_id").references(() => aiChatMessages.id, { onDelete: "set null" }),
    tool: text("tool").notNull(),
    tier: text("tier", { enum: ["low", "confirm"] }).notNull(),
    status: text("status", {
      enum: ["applied", "pending", "confirmed", "rejected", "undone", "expired", "failed"],
    }).notNull(),
    /** Short, plain sentence shown on the action card. */
    summary: text("summary").notNull(),
    /** What undo must restore (null when the action cannot be undone). */
    undo: jsonb("undo"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("ai_action_log_user_status_idx").on(t.userId, t.status, t.createdAt)],
);

/** Confirm-tier actions waiting for one explicit tap. */
export const aiPendingConfirmations = userOwnedTable(
  "ai_pending_confirmations",
  {
    actionId: uuid("action_id")
      .notNull()
      .references(() => aiActionLog.id, { onDelete: "cascade" }),
    /** The validated arguments the tool will run with when confirmed. */
    args: jsonb("args").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("ai_pending_action_uq").on(t.userId, t.actionId),
    index("ai_pending_user_expires_idx").on(t.userId, t.expiresAt),
  ],
);

/** The long-term profile: short human-readable items. */
export const aiProfileItems = userOwnedTable(
  "ai_profile_items",
  {
    text: text("text").notNull(),
    source: text("source", { enum: ["user", "ai"] }).notNull(),
    status: text("status", { enum: ["proposed", "accepted", "edited"] }).notNull(),
  },
  (t) => [index("ai_profile_user_status_idx").on(t.userId, t.status)],
);

/** Counts of AI requests per person per day. Counts only: never content. */
export const aiUsageCounters = userOwnedTable(
  "ai_usage_counters",
  {
    day: date("day", { mode: "string" }).notNull(),
    requests: integer("requests").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
  },
  (t) => [uniqueIndex("ai_usage_user_day_uq").on(t.userId, t.day)],
);
