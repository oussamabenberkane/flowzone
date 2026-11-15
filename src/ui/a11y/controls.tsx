"use client";

/**
 * Embeddable accessibility controls: text size, a dyslexia-friendly font, and less motion.
 * They are small, self-contained and save to this device (see prefs.ts). The Settings screen
 * places them; the Frontend AI agent may move them, but should keep them together.
 */
import { useSyncExternalStore } from "react";
import { ChoiceGroup, ToggleField } from "@/ui/primitives";
import {
  DEFAULT_PREFS,
  readPrefs,
  subscribePrefs,
  writePrefs,
  type AccessibilityPrefs,
  type TextSize,
} from "./prefs";

export function AccessibilityControls() {
  // The stored choice, read from storage on the client. The server renders the defaults.
  const prefs = useSyncExternalStore(subscribePrefs, readPrefs, () => DEFAULT_PREFS);

  function update(next: Partial<AccessibilityPrefs>) {
    writePrefs({ ...prefs, ...next });
  }

  return (
    <div className="fz-stack" data-testid="accessibility-controls">
      <ChoiceGroup<TextSize>
        legend="Text size"
        name="text-size"
        testId="text-size"
        value={prefs.textSize}
        onChange={(textSize) => update({ textSize })}
        options={[
          { value: "standard", label: "Standard" },
          { value: "larger", label: "Larger" },
          { value: "largest", label: "Largest" },
        ]}
      />
      <ToggleField
        label="Dyslexia-friendly font"
        hint="A rounder font with a little more space between letters and lines."
        checked={prefs.font === "dyslexia"}
        onChange={(on) => update({ font: on ? "dyslexia" : "default" })}
        testId="dyslexia-font"
      />
      <ToggleField
        label="Less motion"
        hint="Turns off the gentle movement in the app. Your device setting is respected either way."
        checked={prefs.motion === "less"}
        onChange={(on) => update({ motion: on ? "less" : "system" })}
        testId="less-motion"
      />
    </div>
  );
}
