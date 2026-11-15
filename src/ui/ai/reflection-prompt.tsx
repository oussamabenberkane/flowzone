"use client";

/**
 * The `reflection-prompt` slot: one open, kind question for the end of the day, worded by the AI.
 * While it loads, or when the AI cannot write one, the plain wording stays on screen, so the card
 * never reads blank.
 */
import { useQuery } from "@/ui/data/query";
import { reflectionPrompt } from "./ai-api";

export function ReflectionPromptText({ today, plain }: { today: string; plain: string }) {
  const prompt = useQuery(`ai:reflection:${today}`, reflectionPrompt);
  const text = prompt.data?.text.trim() ? prompt.data.text : plain;
  return <p className="fz-muted">{text}</p>;
}
