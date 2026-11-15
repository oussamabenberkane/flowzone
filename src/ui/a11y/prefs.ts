/**
 * Accessibility preferences that live on this device: text size, the dyslexia-friendly font
 * and "less motion". They are stored in localStorage (a per-device convenience, not account
 * data), and applied as data attributes on <html> so the CSS in globals.css does the rest.
 *
 * Everything here is wrapped in try/catch: storage can be blocked (private windows, strict
 * settings), and the app must still look right with the defaults.
 *
 * Browser-safe. The layout inlines BOOT_SCRIPT so the saved choices apply before the first
 * paint, with no flash of the wrong size or font.
 */

export const PREFS_STORAGE_KEY = "flowzone.prefs";

export type TextSize = "standard" | "larger" | "largest";
export type FontChoice = "default" | "dyslexia";
/** "system" follows the device's reduced-motion setting. "less" forces less motion on top of it. */
export type MotionChoice = "system" | "less";

export interface AccessibilityPrefs {
  textSize: TextSize;
  font: FontChoice;
  motion: MotionChoice;
}

export const DEFAULT_PREFS: AccessibilityPrefs = {
  textSize: "standard",
  font: "default",
  motion: "system",
};

const CHANGED_EVENT = "flowzone:prefs";

function parsePrefs(raw: string | null): AccessibilityPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>;
    return {
      textSize: isTextSize(parsed.textSize) ? parsed.textSize : DEFAULT_PREFS.textSize,
      font: parsed.font === "dyslexia" ? "dyslexia" : DEFAULT_PREFS.font,
      motion: parsed.motion === "less" ? "less" : DEFAULT_PREFS.motion,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// The last raw value and the object built from it. Keeping the same object while nothing changed
// is what lets useSyncExternalStore avoid needless renders.
let cachedRaw: string | null | undefined;
let cachedPrefs: AccessibilityPrefs = DEFAULT_PREFS;

/** The current choices. Safe to call from render (it reads storage, never writes). */
export function readPrefs(): AccessibilityPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parsePrefs(raw);
  }
  return cachedPrefs;
}

/** For useSyncExternalStore: told when a choice changes here or in another tab. */
export function subscribePrefs(listener: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function writePrefs(prefs: AccessibilityPrefs): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage is blocked: the choice still applies for this visit.
  }
  applyPrefs(prefs);
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** Sets or clears the data attributes that the stylesheet reads. */
export function applyPrefs(prefs: AccessibilityPrefs): void {
  const root = document.documentElement;
  setAttr(root, "data-text-size", prefs.textSize === "standard" ? null : prefs.textSize);
  setAttr(root, "data-font", prefs.font === "dyslexia" ? "dyslexia" : null);
  setAttr(root, "data-motion", prefs.motion === "less" ? "less" : null);
}

function setAttr(el: HTMLElement, name: string, value: string | null) {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

function isTextSize(value: unknown): value is TextSize {
  return value === "standard" || value === "larger" || value === "largest";
}

/**
 * Runs before first paint (inlined in <head>). Must stay tiny and must never throw.
 * It mirrors readPrefs and applyPrefs; keep the two in step.
 */
export const BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFS_STORAGE_KEY,
)})||"{}");var r=document.documentElement;if(p.textSize==="larger"||p.textSize==="largest")r.setAttribute("data-text-size",p.textSize);if(p.font==="dyslexia")r.setAttribute("data-font","dyslexia");if(p.motion==="less")r.setAttribute("data-motion","less");}catch(e){}})();`;
