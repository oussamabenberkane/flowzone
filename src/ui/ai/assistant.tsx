"use client";

/**
 * The global assistant: one tap from any screen, one continuous thread. The entry sits in the
 * top bar (the `global-assistant` slot); the thread opens in a sheet. Replies stream in. Low-risk
 * actions appear as applied cards with Undo; higher-risk ones wait for one explicit yes.
 *
 * Screen readers hear the finished reply and each new card once, through one polite status
 * line. The streamed text itself is not announced word by word.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AI_CHAT_MAX_CHARS } from "@/shared/ai";
import { messageFor } from "@/ui/api/client";
import { invalidate, useQuery } from "@/ui/data/query";
import { Button, LoadingLine, Notice, Sheet, TextAreaField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import {
  clearChat,
  getChatHistory,
  listActions,
  listPendingActions,
  sendChatMessage,
  type ActionCardView,
  type ChatMessageView,
} from "./ai-api";
import { ActionCard } from "./action-card";
import { RESTING_COPY } from "./ai-copy";
import { afterAiChange, useAi } from "./use-ai";
import styles from "./ai.module.css";

/* ----- The top-bar entry ----- */

export function GlobalAssistant() {
  const [open, setOpen] = useState(false);
  const pending = useQuery("ai:pending", listPendingActions);
  const waiting = pending.data?.actions.length ?? 0;

  return (
    <>
      <Button
        small
        variant="soft"
        onClick={() => setOpen(true)}
        data-testid="assistant-button"
        aria-label={waiting > 0 ? `Ask FlowZone, ${waiting} waiting for your yes` : "Ask FlowZone"}
      >
        <RiverIcon />
        Ask
        {waiting > 0 ? (
          <span className={styles.askCount} aria-hidden="true">
            {waiting}
          </span>
        ) : null}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Ask FlowZone"
        testId="assistant-sheet"
      >
        <AssistantPanel />
      </Sheet>
    </>
  );
}

function RiverIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 9c2-2 4 2 6 0s4 2 6 0 4 2 6 0" />
      <path d="M3 15c2-2 4 2 6 0s4 2 6 0 4 2 6 0" />
    </svg>
  );
}

/* ----- The thread ----- */

interface Turn {
  text: string;
  reply: string;
  status: "sending" | "streaming";
}

type ThreadItem =
  | { kind: "message"; key: string; at: number; message: ChatMessageView }
  | { kind: "card"; key: string; at: number; card: ActionCardView };

/** Messages and applied or finished cards, in the order they happened. */
function buildThread(messages: ChatMessageView[], cards: ActionCardView[]): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages
      .filter((message) => message.complete || message.content.length > 0)
      .map((message) => ({
        kind: "message" as const,
        key: `m-${message.id}`,
        at: Date.parse(message.createdAt),
        message,
      })),
    ...cards.map((card) => ({
      kind: "card" as const,
      key: `c-${card.id}`,
      at: Date.parse(card.createdAt),
      card,
    })),
  ];
  return items.sort((a, b) => a.at - b.at);
}

function AssistantPanel() {
  const ai = useAi();
  const history = useQuery("ai:chat", getChatHistory);
  const actions = useQuery("ai:actions", listActions);
  const pending = useQuery("ai:pending", listPendingActions);

  const [draft, setDraft] = useState("");
  const [turn, setTurn] = useState<Turn | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const messages = history.data?.messages;
  const cards = actions.data?.actions;
  const items = useMemo(
    () =>
      buildThread(
        messages ?? [],
        (cards ?? []).filter((card) => card.status !== "pending"),
      ),
    [messages, cards],
  );
  const waiting = pending.data?.actions ?? [];
  const busy = turn !== null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, turn?.reply]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || !ai.available) return;

    setProblem(null);
    setAnnouncement("");
    setTurn({ text, reply: "", status: "sending" });

    let succeeded = false;
    // A provider failure arrives inside the stream, so the request itself "finishes". It must still
    // keep the person's text in the box.
    let failedInStream = false;
    try {
      const result = await sendChatMessage(text, (streamed) => {
        switch (streamed.type) {
          case "start":
            setTurn((current) => (current ? { ...current, status: "streaming" } : current));
            break;
          case "delta":
            setTurn((current) =>
              current
                ? { ...current, status: "streaming", reply: current.reply + streamed.text }
                : current,
            );
            break;
          case "action":
            setAnnouncement(
              streamed.action.status === "pending"
                ? `Waiting for your yes: ${streamed.action.summary}`
                : streamed.action.summary,
            );
            break;
          case "done":
            setAnnouncement("FlowZone replied.");
            break;
          case "error":
            failedInStream = true;
            setProblem(RESTING_COPY[streamed.reason]);
            break;
        }
      });
      if (result.kind === "unavailable") {
        setProblem(RESTING_COPY[result.reason]);
      } else {
        succeeded = !failedInStream;
      }
    } catch (error) {
      // Nothing was saved (the request never reached the server), so the text stays in the box.
      setProblem(messageFor(error));
    }

    // Show the saved thread from the server before the live turn goes away, so nothing flickers.
    await afterAiChange();
    setTurn(null);
    if (succeeded) setDraft("");
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter adds a line, as on any phone. Ctrl+Enter (or Cmd+Enter) sends, for keyboards.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const isEmpty = items.length === 0 && turn === null && messages !== undefined;

  return (
    <div className={styles.chat}>
      {!ai.available && ai.reason ? <Notice>{RESTING_COPY[ai.reason]}</Notice> : null}

      <section className={styles.thread} aria-label="Conversation" data-testid="assistant-thread">
        {waiting.length > 0 ? (
          <div className={styles.pinned} data-testid="assistant-pending">
            <h3>Waiting for your yes</h3>
            {waiting.map((card) => (
              <ActionCard key={card.id} card={card} onAnnounce={setAnnouncement} />
            ))}
          </div>
        ) : null}

        {history.status === "loading" && messages === undefined ? (
          <LoadingLine label="Opening your conversation…" />
        ) : null}

        {isEmpty ? (
          <div className={styles.stack}>
            <p>What can I help with?</p>
            <p className={styles.lede}>
              I can add tasks, plan your day, break a task into steps and save notes. Deleting
              things, or changing many at once, waits for your yes.
            </p>
          </div>
        ) : null}

        {items.map((item) =>
          item.kind === "message" ? (
            <MessageView key={item.key} message={item.message} />
          ) : (
            <ActionCard key={item.key} card={item.card} onAnnounce={setAnnouncement} />
          ),
        )}

        {turn ? (
          <>
            <p className={`${styles.message} ${styles.messageYou}`} data-testid="chat-message-user">
              <span className="fz-visually-hidden">You: </span>
              {turn.text}
            </p>
            {turn.reply ? (
              <p className={`${styles.message} ${styles.messageAi}`} data-testid="chat-message-ai">
                <span className="fz-visually-hidden">FlowZone: </span>
                {turn.reply}
              </p>
            ) : null}
            {turn.reply === "" ? <p className={styles.thinking}>Thinking…</p> : null}
          </>
        ) : null}
        <div ref={endRef} />
      </section>

      <p
        className="fz-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="assistant-announcer"
      >
        {announcement}
      </p>

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      <form className={styles.composer} onSubmit={(event) => void send(event)}>
        <TextAreaField
          label="Ask or tell FlowZone"
          hint="For example: add buy oat milk for Saturday, or plan my day."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKey}
          maxLength={AI_CHAT_MAX_CHARS}
          rows={2}
          disabled={!ai.available || busy}
          data-testid="assistant-input"
        />
        <div className={styles.composerRow}>
          {messages && messages.length > 0 ? <ClearChatControl /> : null}
          <Button
            type="submit"
            disabled={!ai.available || busy || draft.trim().length === 0}
            data-testid="assistant-send"
          >
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessageView }) {
  const you = message.role === "user";
  return (
    <p
      className={`${styles.message} ${you ? styles.messageYou : styles.messageAi}`}
      data-testid={you ? "chat-message-user" : "chat-message-ai"}
    >
      <span className="fz-visually-hidden">{you ? "You: " : "FlowZone: "}</span>
      {message.content}
      {!message.complete ? <span className={styles.messageNote}> Stopped here.</span> : null}
    </p>
  );
}

/**
 * Clears the whole chat after one more tap. The record of what FlowZone changed is kept.
 * Used in the assistant and in Settings.
 */
export function ClearChatControl() {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setProblem(null);
    try {
      await clearChat();
      await invalidate("ai:chat");
      setAsking(false);
      toast.show("Chat cleared.");
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <Button variant="quiet" small onClick={() => setAsking(true)} data-testid="chat-clear">
        Clear the chat
      </Button>
    );
  }

  return (
    <div className={styles.stack} style={{ width: "100%" }}>
      <Notice>
        Clear the chat? Your messages will be removed. The record of what FlowZone changed stays.
      </Notice>
      {problem ? <Notice role="alert">{problem}</Notice> : null}
      <div className={styles.dataRow}>
        <Button small disabled={busy} onClick={() => void clear()} data-testid="chat-clear-confirm">
          {busy ? "Clearing…" : "Yes, clear it"}
        </Button>
        <Button variant="quiet" small onClick={() => setAsking(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
