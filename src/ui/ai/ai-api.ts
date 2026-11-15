/**
 * Typed calls for the AI endpoints (docs/contracts/ai.md, section 10), plus the settings and
 * account calls the AI screens need. The response shapes are copied here, not imported from
 * src/services, because those files are server-only. Keep them in step with src/services/ai/*.ts.
 */
import { SIGN_IN_PATH } from "@/shared/auth";
import { DEFAULT_ERROR_MESSAGE, type ErrorCode, type ValidationIssue } from "@/shared/errors";
import type { AiAccessView, AiActionStatus, AiTier, AiUnavailableReason } from "@/shared/ai";
import type { ConsentSwitch } from "@/shared/consent";
import type { QuickAddView, SettingsView, TaskDetailView, TaskView } from "@/shared/views";
import { ApiRequestError, OFFLINE_MESSAGE, api } from "@/ui/api/client";

const BASE = "/api/ai";

export interface AiStatusView {
  switches: AiAccessView;
  available: boolean;
  reason: AiUnavailableReason | null;
  provider: string;
  model: string | null;
  usage: { used: number; limit: number };
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  complete: boolean;
  createdAt: string;
}

export interface ActionCardView {
  id: string;
  tool: string;
  tier: AiTier;
  status: AiActionStatus;
  /** One plain sentence, written by the server. */
  summary: string;
  canUndo: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export type ChatStreamEvent =
  | { type: "start"; messageId: string }
  | { type: "delta"; text: string }
  | { type: "action"; action: ActionCardView }
  | { type: "done"; messageId: string }
  | { type: "error"; reason: AiUnavailableReason };

export type ProfileStatus = "proposed" | "accepted" | "edited";

export interface ProfileItemView {
  id: string;
  text: string;
  source: "user" | "ai";
  status: ProfileStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureResultView {
  source: "ai" | "deterministic";
  reason: AiUnavailableReason | null;
  parsed: QuickAddView;
}

export type BreakdownResultView =
  | { available: true; task: TaskDetailView; card: ActionCardView | null }
  | { available: false; reason: AiUnavailableReason };

export interface TodayProposalView {
  source: "ai" | "rules";
  reason: AiUnavailableReason | null;
  items: { task: TaskView; reason: string }[];
}

export type FreshLookOptionView =
  | { kind: "reschedule"; dueDate: string; label: string }
  | { kind: "simplify"; title: string; label: string }
  | { kind: "breakdown"; label: string };

export interface FreshLookHelpView {
  source: "ai" | "rules";
  reason: AiUnavailableReason | null;
  options: FreshLookOptionView[];
}

export interface ReflectionView {
  source: "ai" | "fallback";
  reason: AiUnavailableReason | null;
  text: string;
}

export type RefreshView =
  | { available: true; proposed: ProfileItemView[] }
  | { available: false; reason: AiUnavailableReason };

/* ----- Status and history ----- */

export const getAiStatus = () => api.get<AiStatusView>(`${BASE}/status`);
export const getChatHistory = () => api.get<{ messages: ChatMessageView[] }>(`${BASE}/chat`);
export const clearChat = () => api.delete<{ cleared: number }>(`${BASE}/chat`);

/* ----- Actions (applied, pending, confirm, reject, undo) ----- */

export const listActions = () => api.get<{ actions: ActionCardView[] }>(`${BASE}/actions`);
export const listPendingActions = () =>
  api.get<{ actions: ActionCardView[] }>(`${BASE}/actions/pending`);
export const confirmAction = (id: string) =>
  api.post<{ action: ActionCardView }>(`${BASE}/actions/${id}/confirm`);
export const rejectAction = (id: string) =>
  api.post<{ action: ActionCardView }>(`${BASE}/actions/${id}/reject`);
export const undoAction = (id: string) =>
  api.post<{ action: ActionCardView }>(`${BASE}/actions/${id}/undo`);

/* ----- Profile ----- */

export const listProfile = () => api.get<{ items: ProfileItemView[] }>(`${BASE}/profile`);
export const addProfileItem = (text: string) =>
  api.post<ProfileItemView>(`${BASE}/profile`, { text });
export const editProfileItem = (id: string, text: string) =>
  api.patch<ProfileItemView>(`${BASE}/profile/${id}`, { text });
export const acceptProfileItem = (id: string) =>
  api.post<ProfileItemView>(`${BASE}/profile/${id}/accept`);
export const deleteProfileItem = (id: string) => api.delete(`${BASE}/profile/${id}`);
export const refreshProfile = () => api.post<RefreshView>(`${BASE}/profile/refresh`);

/* ----- Features ----- */

export const parseCapture = (text: string) =>
  api.post<CaptureResultView>(`${BASE}/capture/parse`, { text });
export const breakDownTaskWithAi = (id: string) =>
  api.post<BreakdownResultView>(`${BASE}/tasks/${id}/breakdown`);
export const freshLookHelp = (id: string) =>
  api.post<FreshLookHelpView>(`${BASE}/tasks/${id}/fresh-look`);
export const todayProposal = (energy?: "low" | "medium" | "high") =>
  api.post<TodayProposalView>(`${BASE}/today/proposal`, energy ? { energy } : {});
export const reflectionPrompt = () => api.post<ReflectionView>(`${BASE}/reflection`);

/* ----- Consent, settings and account (the non-AI parts of Settings) ----- */

export const updateConsent = (body: Partial<Record<ConsentSwitch, boolean>>) =>
  api.patch<SettingsView>("/api/settings/consent", body);
export const exportUrl = "/api/account/export";
export const deleteAccountNow = () =>
  api.post<{ deleted: true }>("/api/account/delete", { confirm: "DELETE" });

/* ----- Chat stream (newline-delimited JSON) ----- */

export type ChatSendResult =
  { kind: "unavailable"; reason: AiUnavailableReason } | { kind: "streamed" };

/**
 * Sends one chat message and reads the reply as it streams. `onEvent` is called once per line.
 * If the AI cannot run, the server answers with JSON instead and this returns `unavailable`
 * (nothing was saved, so the person's text can be sent again).
 */
export async function sendChatMessage(
  text: string,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<ChatSendResult> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/chat/messages`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json",
      },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ApiRequestError({ code: "network", status: 0, message: OFFLINE_MESSAGE });
  }

  if (!response.ok) throw await errorFrom(response);

  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await response.json()) as { available: false; reason: AiUnavailableReason };
    return { kind: "unavailable", reason: body.reason };
  }
  if (!response.body) {
    throw new ApiRequestError({
      code: "unknown",
      status: response.status,
      message: DEFAULT_ERROR_MESSAGE.internal_error,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const event = parseLine(line);
      if (event) onEvent(event);
      index = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  const last = parseLine(buffer);
  if (last) onEvent(last);
  return { kind: "streamed" };
}

function parseLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as ChatStreamEvent;
  } catch {
    // A line that is not JSON is dropped. The reply keeps whatever arrived before it.
    return null;
  }
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(SIGN_IN_PATH);
  }
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: ValidationIssue[]; traceId?: string };
  } | null;
  const error = payload?.error;
  const known = typeof error?.code === "string" && error.code in DEFAULT_ERROR_MESSAGE;
  return new ApiRequestError({
    code: known ? (error?.code as ErrorCode) : "unknown",
    status: response.status,
    message: error?.message ?? DEFAULT_ERROR_MESSAGE.internal_error,
    details: error?.details,
    traceId: error?.traceId ?? null,
  });
}
