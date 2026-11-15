"use client";

/**
 * Repeat settings for a task, as plain choices: never repeats, every day, every few days,
 * on chosen weekdays, or on a day of the month. The draft converts to the API's rule shape
 * (docs/contracts/api.md, 2.3) only when saved.
 */
import type { RecurrenceRule } from "@/shared/recurrence";
import type { RecurrenceView } from "@/shared/views";
import { ChoiceGroup, TextField, ToggleField } from "@/ui/primitives";
import { WEEKDAY_NAMES } from "@/ui/format";

export type RepeatKind = "never" | "daily" | "every_n_days" | "weekly" | "monthly";

export interface RepeatDraft {
  kind: RepeatKind;
  interval: number;
  days: number[];
  dayOfMonth: number;
  paused: boolean;
}

export function draftFrom(recurrence: RecurrenceView | null): RepeatDraft {
  const base: RepeatDraft = { kind: "never", interval: 2, days: [1], dayOfMonth: 1, paused: false };
  if (!recurrence) return base;
  const rule = recurrence.rule;
  const paused = recurrence.paused;
  switch (rule.type) {
    case "daily":
      return { ...base, kind: "daily", paused };
    case "every_n_days":
      return { ...base, kind: "every_n_days", interval: rule.interval, paused };
    case "weekly":
      return { ...base, kind: "weekly", days: [...rule.days].sort((a, b) => a - b), paused };
    case "monthly":
      return { ...base, kind: "monthly", dayOfMonth: rule.day, paused };
  }
}

/** The part of a PATCH body that sets the repeat: an object, or null to remove it. */
export function recurrenceInputFrom(
  draft: RepeatDraft,
): { rule: RecurrenceRule; paused: boolean } | null {
  switch (draft.kind) {
    case "never":
      return null;
    case "daily":
      return { rule: { type: "daily" }, paused: draft.paused };
    case "every_n_days":
      return { rule: { type: "every_n_days", interval: draft.interval }, paused: draft.paused };
    case "weekly":
      return { rule: { type: "weekly", days: draft.days }, paused: draft.paused };
    case "monthly":
      return { rule: { type: "monthly", day: draft.dayOfMonth }, paused: draft.paused };
  }
}

export function RecurrenceEditor({
  draft,
  onChange,
  allowPause,
}: {
  draft: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  allowPause: boolean;
}) {
  const set = (patch: Partial<RepeatDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="fz-stack" data-testid="repeat-editor">
      <ChoiceGroup<RepeatKind>
        legend="Repeat"
        name="repeat"
        testId="repeat-kind"
        value={draft.kind}
        onChange={(kind) => set({ kind, paused: kind === "never" ? false : draft.paused })}
        options={[
          { value: "never", label: "Never" },
          { value: "daily", label: "Every day" },
          { value: "every_n_days", label: "Every few days" },
          { value: "weekly", label: "On days of the week" },
          { value: "monthly", label: "Monthly" },
        ]}
      />

      {draft.kind === "every_n_days" ? (
        <TextField
          label="Every how many days?"
          type="number"
          inputMode="numeric"
          min={2}
          max={365}
          value={draft.interval}
          onChange={(event) => set({ interval: Number(event.target.value) })}
          hint="Between 2 and 365. For every day, choose “Every day”."
          data-testid="repeat-interval"
        />
      ) : null}

      {draft.kind === "weekly" ? (
        <fieldset className="fz-choices" data-testid="repeat-days">
          <legend>Which days?</legend>
          {WEEKDAY_NAMES.map((name, index) => {
            const checked = draft.days.includes(index);
            return (
              <label className="fz-choice" key={name}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? draft.days.filter((d) => d !== index)
                      : [...draft.days, index];
                    if (next.length > 0) set({ days: next });
                  }}
                />
                <span>{name}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {draft.kind === "monthly" ? (
        <TextField
          label="Which day of the month?"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={draft.dayOfMonth}
          onChange={(event) => set({ dayOfMonth: Number(event.target.value) })}
          hint="In shorter months it lands on the last day."
          data-testid="repeat-day-of-month"
        />
      ) : null}

      {draft.kind !== "never" && allowPause ? (
        <ToggleField
          label="Pause for now"
          hint="It stays set up, and comes back when you resume it."
          checked={draft.paused}
          onChange={(paused) => set({ paused })}
          testId="repeat-paused"
        />
      ) : null}
    </div>
  );
}
