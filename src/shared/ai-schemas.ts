import { z } from "zod";
import { AI_CAPTURE_MAX_CHARS, AI_CHAT_MAX_CHARS, AI_PROFILE_ITEM_MAX_CHARS } from "./ai";

/**
 * Request bodies for the AI endpoints. Strict: an unknown field is an error, as everywhere
 * in the API (docs/contracts/api.md, "Strict bodies"). Contract: docs/contracts/ai.md.
 */

export const chatMessageBody = z
  .object({ text: z.string().trim().min(1).max(AI_CHAT_MAX_CHARS) })
  .strict();

export const profileTextBody = z
  .object({ text: z.string().trim().min(1).max(AI_PROFILE_ITEM_MAX_CHARS) })
  .strict();

export const captureBody = z
  .object({ text: z.string().trim().min(1).max(AI_CAPTURE_MAX_CHARS) })
  .strict();

export const todayProposalBody = z
  .object({ energy: z.enum(["low", "medium", "high"]).optional() })
  .strict();
