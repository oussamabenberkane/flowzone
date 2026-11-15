"use client";

/**
 * The first-run choices. Shown once, on a new account, until the person saves or skips. Every
 * switch starts off. Saving records the choices and marks the first run complete; skipping only
 * marks it complete. Either way it never shows again, and every choice can be changed in Settings.
 *
 * It is a dismissable sheet, not a gate: Skip, Escape and the close button all finish it, so
 * FlowZone is never blocked. Completion is stored through the settings API (firstRunCompleted),
 * not on the device.
 */
import { useRef, useState } from "react";
import type { ConsentSwitch } from "@/shared/consent";
import { CONSENT_SWITCHES } from "@/shared/consent";
import { messageFor } from "@/ui/api/client";
import { getSettings, updateSettings } from "@/ui/api/resources";
import { setQueryData, useQuery } from "@/ui/data/query";
import { Button, Sheet, ToggleField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { updateConsent } from "./ai-api";
import {
  FIRST_RUN_INTRO,
  SWITCH_COPY,
  SWITCH_ORDER,
  WARNING_HEADING,
  WARNING_TEXT,
} from "./ai-copy";
import { afterAiChange } from "./use-ai";
import styles from "./ai.module.css";

const ALL_OFF = Object.fromEntries(CONSENT_SWITCHES.map((key) => [key, false])) as Record<
  ConsentSwitch,
  boolean
>;

export function FirstRunChoices() {
  const settings = useQuery("settings", getSettings);
  const toast = useToast();
  const [choices, setChoices] = useState<Record<ConsentSwitch, boolean>>(ALL_OFF);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);

  const shown = settings.data !== undefined && !settings.data.firstRunCompleted && !finished;

  async function finish(save: boolean) {
    if (finishedRef.current || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (save) {
        const view = await updateConsent(choices);
        setQueryData("settings", () => view);
      }
      const view = await updateSettings({ firstRunCompleted: true });
      setQueryData("settings", () => view);
      await afterAiChange();
      finishedRef.current = true;
      setFinished(true);
    } catch (error) {
      if (save) {
        setProblem(messageFor(error));
      } else {
        // Closed with Escape while offline: the sheet has already closed, so say what happened.
        toast.show(messageFor(error), { tone: "problem" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={shown}
      onClose={() => {
        // Escape or the close button counts as skipping. Nothing is saved unless the person chose it.
        if (!finishedRef.current) void finish(false);
      }}
      title="AI, and your choices"
      testId="first-run-sheet"
    >
      <div className={styles.stack}>
        <p>{FIRST_RUN_INTRO}</p>

        <section className={styles.group} aria-labelledby="first-run-warning">
          <h3 id="first-run-warning">{WARNING_HEADING}</h3>
          <p className="fz-notice">{WARNING_TEXT}</p>
        </section>

        <fieldset className={styles.group} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Choose what you are happy to share. Everything starts off.</legend>
          {SWITCH_ORDER.map((key) => (
            <ToggleField
              key={key}
              label={SWITCH_COPY[key].label}
              hint={SWITCH_COPY[key].hint}
              checked={choices[key]}
              onChange={(checked) => setChoices((current) => ({ ...current, [key]: checked }))}
              testId={`first-run-${key}`}
            />
          ))}
        </fieldset>

        {problem ? (
          <p className="fz-notice" role="alert">
            {problem}
          </p>
        ) : null}

        <div className="fz-sheet-foot">
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => void finish(false)}
            data-testid="first-run-skip"
          >
            Skip for now
          </Button>
          <Button disabled={busy} onClick={() => void finish(true)} data-testid="first-run-save">
            {busy ? "Saving…" : "Save my choices"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
