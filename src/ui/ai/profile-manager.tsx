"use client";

/**
 * The profile: a short, human-readable list the person can always see, edit and delete. The AI
 * only ever adds suggestions. Each suggestion waits for the person to accept, edit or reject it.
 * Nothing the AI suggests is kept until the person accepts it, and the AI never changes an item
 * the person has accepted or written.
 */
import { useState } from "react";
import { messageFor } from "@/ui/api/client";
import { invalidate, useQuery } from "@/ui/data/query";
import { Button, Notice, TextAreaField, TextField } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import {
  acceptProfileItem,
  addProfileItem,
  deleteProfileItem,
  editProfileItem,
  listProfile,
  refreshProfile,
  type ProfileItemView,
} from "./ai-api";
import { PROFILE_INTRO, RESTING_COPY } from "./ai-copy";
import { useAi } from "./use-ai";
import styles from "./ai.module.css";

const PROFILE_KEY = "ai:profile";
const MAX_ITEM = 200;

function statusLine(item: ProfileItemView): string {
  if (item.status === "proposed") return "Suggested by FlowZone";
  if (item.status === "edited") return "Edited by you";
  return item.source === "user" ? "Added by you" : "Accepted from a suggestion";
}

export function ProfileManager() {
  const ai = useAi();
  const toast = useToast();
  const profile = useQuery(PROFILE_KEY, listProfile);
  const items = profile.data?.items ?? [];

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const canSuggest = ai.features && ai.profile;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      await invalidate(PROFILE_KEY);
      toast.show(message);
      return true;
    } catch (error) {
      setProblem(messageFor(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const text = draft.trim();
    if (!text) return;
    if (await run(() => addProfileItem(text), "Added to your profile.")) setDraft("");
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    if (await run(() => editProfileItem(id, text), "Saved to your profile.")) setEditingId(null);
  }

  async function suggest() {
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      const result = await refreshProfile();
      await invalidate(PROFILE_KEY);
      if (!result.available) {
        setNote(RESTING_COPY[result.reason]);
      } else if (result.proposed.length === 0) {
        setNote("Nothing new to suggest right now. Your profile stays as it is.");
      } else {
        setNote(
          result.proposed.length === 1
            ? "One suggestion is waiting below."
            : `${result.proposed.length} suggestions are waiting below.`,
        );
      }
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const proposed = items.filter((item) => item.status === "proposed");
  const kept = items.filter((item) => item.status !== "proposed");

  return (
    <div className={styles.stack} data-testid="profile-manager">
      <p className={styles.lede}>{PROFILE_INTRO}</p>

      {problem ? <Notice role="alert">{problem}</Notice> : null}

      {profile.status === "ready" && items.length === 0 ? (
        <p className={styles.lede} data-testid="profile-empty">
          Your profile is empty. Add a line about how you like to work, or ask for a few suggestions
          when you feel like it.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className={styles.profileList} aria-label="Your profile" data-testid="profile-list">
          {[...proposed, ...kept].map((item) => (
            <li
              key={item.id}
              className={`${styles.profileItem} ${item.status === "proposed" ? styles.profileProposed : ""}`}
              data-testid="profile-item"
              data-status={item.status}
            >
              {editingId === item.id ? (
                <div className={styles.inlineField}>
                  <TextField
                    label="Your line"
                    value={editText}
                    maxLength={MAX_ITEM}
                    onChange={(event) => setEditText(event.target.value)}
                    data-testid="profile-edit-input"
                  />
                  <div className={styles.dataRow}>
                    <Button small disabled={busy} onClick={() => void saveEdit(item.id)}>
                      Save
                    </Button>
                    <Button variant="quiet" small onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.profileText}>{item.text}</p>
                  <p className={styles.profileMeta}>{statusLine(item)}</p>
                  <div className={styles.dataRow}>
                    {item.status === "proposed" ? (
                      <>
                        <Button
                          small
                          disabled={busy}
                          data-testid="profile-accept"
                          onClick={() =>
                            void run(() => acceptProfileItem(item.id), "Kept in your profile.")
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          variant="quiet"
                          small
                          onClick={() => {
                            setEditingId(item.id);
                            setEditText(item.text);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="line"
                          small
                          disabled={busy}
                          data-testid="profile-reject"
                          onClick={() =>
                            void run(() => deleteProfileItem(item.id), "Not added to your profile.")
                          }
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="quiet"
                          small
                          onClick={() => {
                            setEditingId(item.id);
                            setEditText(item.text);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="line"
                          small
                          disabled={busy}
                          data-testid="profile-delete"
                          onClick={() =>
                            void run(() => deleteProfileItem(item.id), "Removed from your profile.")
                          }
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className={styles.inlineField}
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <TextAreaField
          label="Add something about you"
          hint="For example: I focus best in the mornings. Up to 30 lines."
          value={draft}
          maxLength={MAX_ITEM}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          data-testid="profile-add-input"
        />
        <div className={styles.dataRow}>
          <Button
            type="submit"
            small
            disabled={busy || draft.trim().length === 0}
            data-testid="profile-add"
          >
            Add to my profile
          </Button>
        </div>
      </form>

      <div className={styles.group}>
        <div className={styles.dataRow}>
          <Button
            variant="line"
            small
            disabled={busy || !canSuggest}
            onClick={() => void suggest()}
            data-testid="profile-suggest"
          >
            Suggest a few lines
          </Button>
        </div>
        {!canSuggest ? (
          <p className={styles.lede}>
            Suggestions need Tasks and chat and Your profile to be on, above.
          </p>
        ) : null}
        {note ? (
          <p className={styles.lede} role="status">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
