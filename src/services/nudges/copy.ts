import "server-only";
import { forbiddenPhraseIn } from "@/server/ai/prompts";
import type { NudgeCandidate } from "./policy";

/**
 * The fixed, kind wording for nudges. Used whenever AI wording is off, unavailable or
 * unsuitable. Every template contains the reason (the "why"). Contract: docs/contracts/nudges.md,
 * section 5. Voice rules: docs/contracts/design-system.md (section 7) and ai.md (section 13.1).
 */

const TITLE_SHOWN_CHARS = 80;

/** The task title, shortened for a notification. */
function shownTitle(title: string): string {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_SHOWN_CHARS ? `${flat.slice(0, TITLE_SHOWN_CHARS - 1)}…` : flat;
}

/**
 * A title with a forbidden word is not used in a nudge (the brief says a borderline candidate is
 * not sent). The engine drops such candidates before choosing.
 */
export function isNudgeSafeTitle(title: string): boolean {
  return forbiddenPhraseIn(title) === null;
}

/** The fixed text for one candidate. Always contains `candidate.reason`. */
export function templateNudge(candidate: NudgeCandidate): string {
  const title = `“${shownTitle(candidate.title)}”`;
  switch (candidate.kind) {
    case "due_soon":
      return `${title} is ${candidate.reason}.`;
    case "check_in":
      return `${title} ${candidate.reason}. A fresh look may help.`;
    case "resurface":
      return `${title} ${candidate.reason}. Want a fresh look?`;
  }
}

/** The note sent when someone asks for a test from Settings. It says why it was sent. */
export const TEST_NUDGE_BODY =
  "You asked for this test in Settings. Notifications are working on this device.";
