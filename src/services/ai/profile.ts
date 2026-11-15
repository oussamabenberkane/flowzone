import "server-only";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { validationFailed, notFound } from "@/server/http/errors";
import { aiProfileItems, entries } from "@/server/db/schema";
import {
  AI_CONTEXT_ENTRY_CHARS,
  AI_PROFILE_ITEM_MAX_CHARS,
  AI_PROFILE_MAX_ITEMS,
  AI_PROFILE_REFRESH_MAX,
  type AiUnavailableReason,
} from "@/shared/ai";
import type { ServiceContext } from "../context";
import { type InsertOf, patchFor } from "../db-types";
import { aiAccess } from "./access";
import { askForJson } from "./run";
import { PURPOSE_PROMPTS, chatSystemPrompt } from "@/server/ai/prompts";
import { buildContextData, contextMessage } from "./context";

/**
 * The long-term profile: short human-readable items. Items are written by the person
 * (source "user") or proposed by the AI (source "ai"). Only the person accepts or edits
 * an item; the AI never changes an accepted item. Contract: docs/contracts/ai.md, "Profile".
 *
 * The person can always list, add, edit, accept and delete their own items: those calls
 * send nothing to a provider. What ai_profile gates is the AI's use of the profile: reading
 * it into a request and proposing new items. See docs/contracts/ai.md, "Opt-in enforcement".
 */

export type ProfileStatus = "proposed" | "accepted" | "edited";
export type ProfileSource = "user" | "ai";

export interface ProfileItemView {
  id: string;
  text: string;
  source: ProfileSource;
  status: ProfileStatus;
  createdAt: string;
  updatedAt: string;
}

type ProfileRow = typeof aiProfileItems.$inferSelect;

function view(row: ProfileRow): ProfileItemView {
  return {
    id: row.id,
    text: row.text,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function checkText(text: string): string {
  const cleaned = cleanText(text);
  if (cleaned === "") {
    throw validationFailed([{ field: "text", message: "Write a short note about how you work." }]);
  }
  if (cleaned.length > AI_PROFILE_ITEM_MAX_CHARS) {
    throw validationFailed([
      {
        field: "text",
        message: `Keep it under ${AI_PROFILE_ITEM_MAX_CHARS} characters.`,
      },
    ]);
  }
  return cleaned;
}

export async function listProfile(ctx: ServiceContext): Promise<ProfileItemView[]> {
  const rows = await ctx.scope.list(aiProfileItems, {
    orderBy: [desc(aiProfileItems.createdAt)],
    limit: AI_PROFILE_MAX_ITEMS,
  });
  return rows.map(view);
}

async function countItems(ctx: ServiceContext): Promise<number> {
  return ctx.scope.count(aiProfileItems);
}

/**
 * Creates an item. A repeat of the same text (ignoring case) returns the existing item, so
 * a proposal never duplicates something the person already has or dismissed-and-kept.
 */
export async function createProfileItem(
  ctx: ServiceContext,
  input: { text: string; source: ProfileSource; status: ProfileStatus },
): Promise<ProfileItemView> {
  const text = checkText(input.text);
  const existing = (await ctx.scope.list(aiProfileItems, { limit: AI_PROFILE_MAX_ITEMS })).find(
    (row) => row.text.toLowerCase() === text.toLowerCase(),
  );
  if (existing) return view(existing);
  if ((await countItems(ctx)) >= AI_PROFILE_MAX_ITEMS) {
    throw validationFailed([
      {
        field: "text",
        message: `The profile holds up to ${AI_PROFILE_MAX_ITEMS} notes. Remove one first.`,
      },
    ]);
  }
  const values = {
    text,
    source: input.source,
    status: input.status,
  } satisfies InsertOf<typeof aiProfileItems>;
  const { row } = await ctx.scope.create(aiProfileItems, values);
  return view(row);
}

/** Writes a fact by hand. It is accepted at once: the person wrote it. */
export function addProfileItemByHand(ctx: ServiceContext, text: string): Promise<ProfileItemView> {
  return createProfileItem(ctx, { text, source: "user", status: "accepted" });
}

async function loadItem(ctx: ServiceContext, id: string): Promise<ProfileRow> {
  const row = await ctx.scope.findById(aiProfileItems, id);
  if (!row) throw notFound();
  return row;
}

/** Changes the wording. An edited item keeps its source and is marked as edited. */
export async function editProfileItem(
  ctx: ServiceContext,
  id: string,
  text: string,
): Promise<ProfileItemView> {
  await loadItem(ctx, id);
  const updated = await ctx.scope.updateById(
    aiProfileItems,
    id,
    patchFor<typeof aiProfileItems>({ text: checkText(text), status: "edited" }),
  );
  if (!updated) throw notFound();
  return view(updated);
}

/** The person accepts a proposal. Accepting an item that is already accepted changes nothing. */
export async function acceptProfileItem(ctx: ServiceContext, id: string): Promise<ProfileItemView> {
  const row = await loadItem(ctx, id);
  if (row.status !== "proposed") return view(row);
  const updated = await ctx.scope.updateById(
    aiProfileItems,
    id,
    patchFor<typeof aiProfileItems>({ status: "accepted" }),
  );
  if (!updated) throw notFound();
  return view(updated);
}

/** Deletes an item, or rejects a proposal (a rejected proposal is simply removed). */
export async function deleteProfileItem(ctx: ServiceContext, id: string): Promise<void> {
  const removed = await ctx.scope.removeById(aiProfileItems, id);
  if (!removed) throw notFound();
}

export const ProposalsSchema = z
  .object({ items: z.array(z.string()).max(AI_PROFILE_REFRESH_MAX) })
  .strict();

export type RefreshResult =
  | { available: true; proposed: ProfileItemView[] }
  | { available: false; reason: AiUnavailableReason };

/**
 * Asks the AI to suggest up to AI_PROFILE_REFRESH_MAX new facts. Needs ai_features and
 * ai_profile. Journal text is included only when ai_notes_journal is also on.
 */
export async function refreshProfileSuggestions(ctx: ServiceContext): Promise<RefreshResult> {
  const access = await aiAccess(ctx);
  if (!access.profile) return { available: false, reason: "not_opted_in" };
  const data = await buildContextData(ctx, access, null);
  if (access.notesJournal) {
    const recent = await ctx.scope.list(entries, {
      orderBy: [desc(entries.entryDate), desc(entries.createdAt)],
      limit: 3,
    });
    data.entries = recent.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      entryDate: entry.entryDate,
      excerpt: entry.body.replace(/\s+/g, " ").slice(0, AI_CONTEXT_ENTRY_CHARS),
    }));
  }
  const result = await askForJson(
    ctx,
    "profile",
    [
      { role: "system", content: chatSystemPrompt(ctx.today, ctx.timeZone) },
      { role: "system", content: PURPOSE_PROMPTS.profile },
      contextMessage(data),
      { role: "user", content: "Suggest profile notes from the context." },
    ],
    ProposalsSchema,
    700,
  );
  if (!result.ok) return { available: false, reason: result.reason };

  const existing = await ctx.scope.list(aiProfileItems, { limit: AI_PROFILE_MAX_ITEMS });
  const known = new Set(existing.map((row) => row.text.toLowerCase()));
  const proposed: ProfileItemView[] = [];
  for (const raw of result.value.items) {
    const cleaned = cleanText(raw);
    if (cleaned === "" || cleaned.length > AI_PROFILE_ITEM_MAX_CHARS) continue;
    if (known.has(cleaned.toLowerCase())) continue;
    if (existing.length + proposed.length >= AI_PROFILE_MAX_ITEMS) break;
    proposed.push(
      await createProfileItem(ctx, { text: cleaned, source: "ai", status: "proposed" }),
    );
    known.add(cleaned.toLowerCase());
  }
  return { available: true, proposed };
}

/** The accepted and edited items, for a prompt. Only read when ai_profile is on. */
export async function profileTextsForPrompt(ctx: ServiceContext): Promise<string[]> {
  const rows = await ctx.scope.list(aiProfileItems, {
    where: inArray(aiProfileItems.status, ["accepted", "edited"]),
    limit: AI_PROFILE_MAX_ITEMS,
  });
  return rows.map((row) => row.text);
}
