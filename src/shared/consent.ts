/**
 * The four consent switches. Canonical names: they are used as database column names,
 * as JSON keys in the API, and by the AI and Nudges agents. Never rename them.
 * Every switch is OFF by default. See docs/contracts/api.md (section "Settings and consent").
 *
 * Pure constants: no imports.
 */
export const CONSENT_SWITCHES = [
  "ai_features",
  "ai_notes_journal",
  "ai_profile",
  "nudges",
] as const;

export type ConsentSwitch = (typeof CONSENT_SWITCHES)[number];
