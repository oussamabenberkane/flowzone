"use client";

/**
 * Small per-device choices for Today: the energy level chosen today, whether the plan prompt
 * was shown today, and whether today's reflection was skipped. They live in localStorage on
 * purpose: they are conveniences for this device, not account data. Every access is guarded,
 * because storage can be blocked, and the screens work without it.
 */
import type { EnergyLevel } from "@/shared/views";

const ENERGY_KEY = "flowzone.energy";
const PLAN_PROMPT_KEY = "flowzone.planPromptDate";
const REFLECTION_SKIP_KEY = "flowzone.reflectionSkipDate";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage is blocked: the choice simply lasts for this visit.
  }
}

/** "Not sure" is stored as null: suggestions then keep every task. */
export function readEnergy(): EnergyLevel | null {
  const value = read(ENERGY_KEY);
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

export function writeEnergy(value: EnergyLevel | null): void {
  write(ENERGY_KEY, value);
}

/** True once the plan prompt has been shown (or dismissed) on this calendar day. */
export function planPromptDoneFor(date: string): boolean {
  return read(PLAN_PROMPT_KEY) === date;
}

export function markPlanPromptDone(date: string): void {
  write(PLAN_PROMPT_KEY, date);
}

export function reflectionSkippedFor(date: string): boolean {
  return read(REFLECTION_SKIP_KEY) === date;
}

export function markReflectionSkipped(date: string): void {
  write(REFLECTION_SKIP_KEY, date);
}
