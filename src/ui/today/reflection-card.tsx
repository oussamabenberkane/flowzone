"use client";

/**
 * The end-of-day reflection: an optional, in-app invitation to write a short journal entry.
 * It appears from the evening on (REFLECTION_START_HOUR, local time on this device), only
 * when there is no journal entry for today yet, and it is always skippable for the day.
 *
 * Owner decision: the default start time is 19:00 local time. Change REFLECTION_START_HOUR.
 *
 * The extension point `reflection-prompt` wraps the wording, so an AI-worded prompt can
 * replace the plain one. The plain wording is the fallback.
 */
import { useState } from "react";
import Link from "next/link";
import { listEntries } from "@/ui/api/resources";
import { useQuery } from "@/ui/data/query";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { Button } from "@/ui/primitives";
import { ReflectionPromptText } from "@/ui/ai/reflection-prompt";
import { useAi } from "@/ui/ai/use-ai";
import { markReflectionSkipped, reflectionSkippedFor } from "./device-prefs";

const PLAIN_REFLECTION = "A line or two is plenty. Or skip it. Either is fine.";

/** Owner decision: evening starts at 19:00 on the device's clock. */
export const REFLECTION_START_HOUR = 19;

export function ReflectionCard({ today }: { today: string | null }) {
  // Decided once, when the screen is shown. Nothing is rendered on the server (there is no today yet).
  const [evening] = useState(() => new Date().getHours() >= REFLECTION_START_HOUR);
  const [hidden, setHidden] = useState(false);
  const ai = useAi();
  const eligible = today !== null && evening && !hidden && !reflectionSkippedFor(today);

  // Only ask the server once the card might show, and only for today's date.
  const existing = useQuery(eligible && today ? `entries:journal:${today}` : null, () =>
    listEntries({ kind: "journal", from: today ?? undefined, to: today ?? undefined, limit: 1 }),
  );

  if (!eligible || !today) return null;
  if (existing.status !== "ready") return null;
  if ((existing.data?.entries.length ?? 0) > 0) return null;

  return (
    <section
      className="fz-card fz-section"
      aria-labelledby="reflection-title"
      data-testid="reflection-card"
    >
      <h2 id="reflection-title">A moment for the day?</h2>
      <ExtensionSlot
        name="reflection-prompt"
        fallback={<p className="fz-muted">{PLAIN_REFLECTION}</p>}
      >
        {ai.features ? <ReflectionPromptText today={today} plain={PLAIN_REFLECTION} /> : undefined}
      </ExtensionSlot>
      <div className="fz-row" style={{ marginTop: "var(--space-3)" }}>
        <Link href={`/notes/new?kind=journal&date=${today}`} className="fz-button fz-button--small">
          Write a few lines
        </Link>
        <Button
          variant="quiet"
          small
          onClick={() => {
            markReflectionSkipped(today);
            setHidden(true);
          }}
        >
          Skip for today
        </Button>
      </div>
    </section>
  );
}
