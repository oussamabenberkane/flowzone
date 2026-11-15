"use client";

/**
 * The Settings sections that the `settings-sections` slot holds: the four switches, time zone
 * and quiet hours, the chat history, the profile and your data. Each switch takes effect at once
 * and says in one short sentence what it turns on.
 */
import { useMemo, useState } from "react";
import type { ConsentSwitch } from "@/shared/consent";
import { messageFor } from "@/ui/api/client";
import { getSettings, updateSettings } from "@/ui/api/resources";
import { invalidate, setQueryData, useQuery } from "@/ui/data/query";
import { Button, LoadingLine, Notice, SelectField, TextField, ToggleField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { updateConsent } from "./ai-api";
import { SWITCH_COPY, SWITCH_ORDER } from "./ai-copy";
import { ClearChatControl } from "./assistant";
import { DataSection } from "./data-section";
import { ProfileManager } from "./profile-manager";
import { afterAiChange, useAi } from "./use-ai";
import styles from "./ai.module.css";

export function SettingsSections() {
  return (
    <>
      <AiChoicesSection />
      <ProfileSection />
      <TimeAndQuietSection />
      <ChatHistorySection />
      <YourDataSection />
    </>
  );
}

/* ----- The four switches ----- */

function AiChoicesSection() {
  const settings = useQuery("settings", getSettings);
  const ai = useAi();
  const toast = useToast();
  const [busy, setBusy] = useState<ConsentSwitch | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function change(key: ConsentSwitch, enabled: boolean) {
    setBusy(key);
    setProblem(null);
    try {
      const body: Partial<Record<ConsentSwitch, boolean>> = {};
      body[key] = enabled;
      const view = await updateConsent(body);
      setQueryData("settings", () => view);
      await afterAiChange();
      toast.show("Saved.");
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="fz-section" aria-labelledby="ai-choices-title" data-testid="ai-choices">
      <h2 id="ai-choices-title">Your AI choices</h2>
      <p className={styles.lede} style={{ margin: "var(--space-1) 0 var(--space-4)" }}>
        Everything starts off. Each choice takes effect straight away and can be changed at any
        time.
      </p>

      {settings.status === "loading" && !settings.data ? (
        <LoadingLine label="Checking your choices…" />
      ) : null}
      {problem ? <Notice role="alert">{problem}</Notice> : null}

      {settings.data ? (
        <div className={styles.stack}>
          {SWITCH_ORDER.map((key) => (
            <ToggleField
              key={key}
              label={SWITCH_COPY[key].label}
              hint={SWITCH_COPY[key].hint}
              checked={settings.data?.consent[key].enabled ?? false}
              onChange={(enabled) => void change(key, enabled)}
              testId={`switch-${key}`}
            />
          ))}
          {busy ? <p className={styles.consentStatus}>Saving…</p> : null}
          {ai.features && ai.usage ? (
            <p className={styles.usage} data-testid="ai-usage">
              Today, {ai.usage.used} of {ai.usage.limit} AI requests used. The count resets at
              midnight in your time zone.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ----- Profile ----- */

function ProfileSection() {
  return (
    <section className="fz-section" aria-labelledby="profile-title">
      <h2 id="profile-title">Your profile</h2>
      <div style={{ marginTop: "var(--space-3)" }}>
        <ProfileManager />
      </div>
    </section>
  );
}

/* ----- Time zone and quiet hours ----- */

function supportedTimeZones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const list = intl.supportedValuesOf?.("timeZone") ?? [];
  return list.includes(current) ? list : [current, ...list];
}

function TimeAndQuietSection() {
  const settings = useQuery("settings", getSettings);
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);

  const data = settings.data;
  const device = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  async function saveZone(timeZone: string) {
    setProblem(null);
    try {
      const view = await updateSettings({ timeZone });
      setQueryData("settings", () => view);
      await invalidate("today");
      toast.show("Time zone saved.");
    } catch (error) {
      setProblem(messageFor(error));
    }
  }

  return (
    <section className="fz-section" aria-labelledby="time-title">
      <h2 id="time-title">Time zone and quiet hours</h2>

      {!data ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <LoadingLine label="Checking your settings…" />
        </div>
      ) : (
        <div className={styles.stack} style={{ marginTop: "var(--space-3)" }}>
          {problem ? <Notice role="alert">{problem}</Notice> : null}

          <div className={styles.group}>
            <SelectField
              label="Time zone"
              hint="Decides what counts as today. It is set from this device the first time you open FlowZone."
              value={data.timeZone}
              onChange={(event) => void saveZone(event.target.value)}
              data-testid="time-zone"
            >
              {supportedTimeZones(data.timeZone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </SelectField>
            {device !== data.timeZone ? (
              <div className={styles.dataRow}>
                <Button variant="line" small onClick={() => void saveZone(device)}>
                  Use this device&apos;s time zone ({device})
                </Button>
              </div>
            ) : null}
          </div>

          <QuietHoursForm
            key={`${data.quietHours.start}-${data.quietHours.end}`}
            start={data.quietHours.start}
            end={data.quietHours.end}
            onSaved={(view) => setQueryData("settings", () => view)}
          />
        </div>
      )}
    </section>
  );
}

function QuietHoursForm({
  start,
  end,
  onSaved,
}: {
  start: string;
  end: string;
  onSaved: (view: Awaited<ReturnType<typeof updateSettings>>) => void;
}) {
  const toast = useToast();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const unchanged = from === start && to === end;

  async function save() {
    if (from === to) {
      setProblem("Quiet hours need a start and an end that are different.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const view = await updateSettings({ quietHoursStart: from, quietHoursEnd: to });
      onSaved(view);
      toast.show("Quiet hours saved.");
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.group}>
      <p className={styles.lede}>
        Quiet hours are when FlowZone keeps notifications to itself. Nothing is lost, it simply
        waits.
      </p>
      <div className={styles.dataRow}>
        <TextField
          label="Quiet from"
          type="time"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          data-testid="quiet-start"
        />
        <TextField
          label="Quiet until"
          type="time"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          data-testid="quiet-end"
        />
      </div>
      {problem ? <Notice role="alert">{problem}</Notice> : null}
      <div className={styles.dataRow}>
        <Button
          small
          disabled={busy || unchanged || !from || !to}
          onClick={() => void save()}
          data-testid="quiet-save"
        >
          {busy ? "Saving…" : "Save quiet hours"}
        </Button>
      </div>
    </div>
  );
}

/* ----- Chat history ----- */

function ChatHistorySection() {
  return (
    <section className="fz-section" aria-labelledby="chat-title">
      <h2 id="chat-title">Chat history</h2>
      <div className={styles.stack} style={{ marginTop: "var(--space-3)" }}>
        <p className={styles.lede}>
          Your conversation with FlowZone is kept until you clear it. Clearing it does not undo
          anything the assistant changed.
        </p>
        <div>
          <ClearChatControl />
        </div>
      </div>
    </section>
  );
}

/* ----- Your data ----- */

function YourDataSection() {
  return (
    <section className="fz-section" aria-labelledby="data-title">
      <h2 id="data-title">Your data</h2>
      <div style={{ marginTop: "var(--space-3)" }}>
        <DataSection />
      </div>
    </section>
  );
}
