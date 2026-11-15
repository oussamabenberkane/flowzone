/**
 * Every sentence the AI screens show that is not a server message. Kept in one file so the
 * voice stays the same: warm, brief, calm, never scolding, never "overdue".
 * Vocabulary follows docs/contracts/design-system.md, section 7.
 */
import type { ConsentSwitch } from "@/shared/consent";
import type { AiUnavailableReason } from "@/shared/ai";

/** Shown in context when the AI cannot run. Everything else keeps working. */
export const RESTING_COPY: Record<AiUnavailableReason, string> = {
  not_opted_in: "Turn on AI in Settings to use this.",
  daily_limit: "AI is resting until tomorrow. Everything else still works.",
  provider_down: "AI is resting for now. Everything else still works.",
};

export const OFFLINE_CHAT =
  "You're offline. Your message is still in the box, so you can send it when you're back.";

/** Recommended first-run warning, verbatim from docs/contracts/ai.md, section 13.4. */
export const WARNING_HEADING = "Before you use AI";
export const WARNING_TEXT =
  "When you ask FlowZone's assistant something, the text you send, and the parts of your tasks and (if you allow it) notes that it needs, are sent to the AI provider that FlowZone's host has set up. The free provider may use what is sent to improve its models. You can turn AI off or limit what it can see at any time in Settings. Without AI, FlowZone works as a normal to-do app.";

export const SWITCH_COPY: Record<ConsentSwitch, { label: string; hint: string }> = {
  ai_features: {
    label: "Tasks and chat",
    hint: "The assistant can add and plan tasks, and help with them. It sends only what it needs for what you ask.",
  },
  ai_notes_journal: {
    label: "Notes and journal",
    hint: "Lets the assistant read your notes and journal to help. Off, it never reads them.",
  },
  ai_profile: {
    label: "Your profile",
    hint: "A short list of what matters to you, which you can always see and change. The assistant reads it only while this is on.",
  },
  nudges: {
    label: "Nudges",
    hint: "Gentle reminders, and notifications on your device if you allow them. Quiet hours still apply.",
  },
};

export const SWITCH_ORDER: ConsentSwitch[] = [
  "ai_features",
  "ai_notes_journal",
  "ai_profile",
  "nudges",
];

export const FIRST_RUN_INTRO =
  "FlowZone works fine without AI. If you want help, choose what it may use. You can change these any time in Settings.";

export const PROFILE_INTRO =
  "This is your profile. You can always see it, change it or delete any of it. FlowZone reads it only while both AI switches are on.";
