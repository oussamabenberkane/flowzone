"use client";

/**
 * "Choose for today": the rules-based suggestions (up to five), shown for the person to keep,
 * change or add to. Nothing is applied until they confirm. The plan holds up to ten tasks.
 *
 * The extension point `plan-day-proposal` sits here: an AI-ranked proposal can be shown in
 * place of the rules-based list (see the slot in TodaySection).
 */
import { useState } from "react";
import { TODAY_PLAN_MAX_ITEMS } from "@/shared/tuning";
import type { DayPlanView, EnergyLevel, SuggestionReason, TaskView } from "@/shared/views";
import { messageFor } from "@/ui/api/client";
import { getSuggestions, putPlan } from "@/ui/api/resources";
import { invalidate, useQuery } from "@/ui/data/query";
import { ChoiceGroup, Button, Sheet, LoadingLine, Notice } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { PlanAiProposal } from "@/ui/ai/plan-ai";
import { useAi } from "@/ui/ai/use-ai";
import { readEnergy, writeEnergy } from "./device-prefs";
import { TODAY_KEY } from "./today-data";

const REASON_TEXT: Record<SuggestionReason, string> = {
  due_today: "Due today",
  due_soon: "Due soon",
  in_progress: "Already in progress",
  high_priority: "High priority",
  resurfacing: "Not touched for a while",
};

type EnergyChoice = EnergyLevel | "any";

export function PlanSheet({
  open,
  onClose,
  today,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  today: string;
  plan: DayPlanView;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Choose for today" testId="plan-sheet">
      <PlanSheetBody today={today} plan={plan} onDone={onClose} />
    </Sheet>
  );
}

function PlanSheetBody({
  today,
  plan,
  onDone,
}: {
  today: string;
  plan: DayPlanView;
  onDone: () => void;
}) {
  const toast = useToast();
  const [energy, setEnergy] = useState<EnergyChoice>(readEnergy() ?? "any");
  const energyFilter = energy === "any" ? undefined : energy;
  const ai = useAi();
  const suggestions = useQuery(`suggestions:${energy}`, () => getSuggestions(energyFilter));

  // Start from the plan as it is now. Each change is a deliberate tick or untick.
  const [selected, setSelected] = useState<string[]>(() => plan.tasks.map((task) => task.id));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const suggested: { task: TaskView; reasons: SuggestionReason[] }[] =
    suggestions.data?.suggestions ?? [];
  const suggestedIds = new Set(suggested.map((item) => item.task.id));
  // Tasks already planned but not among today's suggestions still appear, so nothing is lost.
  const keptFromPlan = plan.tasks.filter((task) => !suggestedIds.has(task.id));
  const atLimit = selected.length >= TODAY_PLAN_MAX_ITEMS;

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= TODAY_PLAN_MAX_ITEMS) return current;
      return [...current, id];
    });
  }

  async function confirm() {
    setBusy(true);
    setProblem(null);
    try {
      writeEnergy(energy === "any" ? null : energy);
      await putPlan(today, { taskIds: selected, confirmed: true });
      await invalidate(TODAY_KEY);
      toast.show(selected.length === 0 ? "Plan cleared." : "Your plan for today is set.");
      onDone();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fz-stack">
      <ChoiceGroup<EnergyChoice>
        legend="How much energy do you have?"
        name="plan-energy"
        testId="plan-energy"
        value={energy}
        options={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "any", label: "Not sure" },
        ]}
        onChange={(value) => setEnergy(value)}
      />
      <p className="fz-muted" style={{ fontSize: "var(--text-sm)" }}>
        Keep, change or add. Up to {TODAY_PLAN_MAX_ITEMS} for today. Nothing changes until you
        confirm.
      </p>

      <ExtensionSlot name="plan-day-proposal" fallback={null}>
        {ai.features ? (
          <PlanAiProposal
            energy={energyFilter}
            onUse={(taskIds) => setSelected(taskIds.slice(0, TODAY_PLAN_MAX_ITEMS))}
          />
        ) : undefined}
      </ExtensionSlot>

      {suggestions.status === "loading" && !suggestions.data ? (
        <LoadingLine label="Finding a few for today…" />
      ) : null}
      {suggestions.status === "error" ? (
        <Notice role="alert">{messageFor(suggestions.error)}</Notice>
      ) : null}

      {suggested.length === 0 && suggestions.status === "ready" && keptFromPlan.length === 0 ? (
        <Notice>
          Nothing open needs a choice right now. Add something from your Inbox or capture a new
          task.
        </Notice>
      ) : null}

      <fieldset
        className="fz-stack"
        style={{ border: 0, padding: 0, margin: 0 }}
        data-testid="plan-options"
      >
        <legend className="fz-visually-hidden">Tasks for today</legend>
        {[
          ...suggested.map((item) => ({ task: item.task, reasons: item.reasons })),
          ...keptFromPlan.map((task) => ({ task, reasons: [] as SuggestionReason[] })),
        ].map(({ task, reasons }) => (
          <label
            key={task.id}
            className="fz-toggle"
            style={{ alignItems: "flex-start", padding: "var(--space-1) 0" }}
          >
            <span>
              {task.title}
              {reasons.length > 0 ? (
                <span className="fz-hint" style={{ display: "block", fontWeight: 400 }}>
                  {reasons.map((reason) => REASON_TEXT[reason]).join(", ")}
                </span>
              ) : null}
            </span>
            <input
              type="checkbox"
              checked={selected.includes(task.id)}
              disabled={!selected.includes(task.id) && atLimit}
              onChange={() => toggle(task.id)}
              data-testid="plan-option"
            />
          </label>
        ))}
      </fieldset>

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      <div className="fz-sheet-foot">
        <Button variant="quiet" onClick={onDone}>
          Not now
        </Button>
        <Button onClick={() => void confirm()} disabled={busy} data-testid="plan-confirm">
          {busy ? "Saving…" : selected.length === 0 ? "Clear the plan" : "Set today's plan"}
        </Button>
      </div>
    </div>
  );
}
