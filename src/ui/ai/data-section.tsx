"use client";

/**
 * Your data: download a copy of everything, or delete the account and all of it. Deleting is
 * the only irreversible action in Settings, so it needs the word DELETE typed, and it says what
 * goes before the button is shown.
 */
import { useState } from "react";
import { SIGN_IN_PATH } from "@/shared/auth";
import { messageFor } from "@/ui/api/client";
import { clearDeviceCaptures } from "@/ui/offline/capture-queue";
import { clearTodaySnapshots } from "@/ui/offline/snapshot";
import { Button, Notice, TextField } from "@/ui/primitives";
import { deleteAccountNow, exportUrl } from "./ai-api";
import styles from "./ai.module.css";

export function DataSection() {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function deleteEverything() {
    setBusy(true);
    setProblem(null);
    try {
      await deleteAccountNow();
      // Nothing of this person stays on the device either.
      await clearDeviceCaptures().catch(() => undefined);
      await clearTodaySnapshots();
      navigator.serviceWorker?.controller?.postMessage({ type: "FLOWZONE_CLEAR_PAGES" });
      window.location.assign(SIGN_IN_PATH);
    } catch (error) {
      setProblem(messageFor(error));
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack} data-testid="data-section">
      <div className={styles.group}>
        <p className={styles.lede}>
          Download a copy of your tasks, projects, notes, journal, chat and profile, as a zip file
          you can open anywhere.
        </p>
        <div className={styles.dataRow}>
          <a
            href={exportUrl}
            download
            className="fz-button fz-button--line"
            data-testid="export-data"
          >
            Download my data
          </a>
        </div>
      </div>

      <div className={styles.group}>
        <p className={styles.lede}>
          Deleting your account removes your tasks, projects, notes, journal, chat, profile and
          settings. It cannot be undone. If you want a copy, download it first.
        </p>

        {!asking ? (
          <div className={styles.dataRow}>
            <Button
              variant="quiet"
              small
              onClick={() => setAsking(true)}
              data-testid="delete-account"
            >
              Delete my account and all my data
            </Button>
          </div>
        ) : (
          <div className={styles.stack} data-testid="delete-account-confirm">
            <Notice>
              This removes everything above, straight away, and signs you out. To carry on, type
              DELETE below.
            </Notice>
            <TextField
              label="Type DELETE to confirm"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
              data-testid="delete-account-input"
            />
            {problem ? <Notice role="alert">{problem}</Notice> : null}
            <div className={styles.dataRow}>
              <Button
                disabled={busy || typed !== "DELETE"}
                onClick={() => void deleteEverything()}
                data-testid="delete-account-now"
              >
                {busy ? "Deleting…" : "Delete everything"}
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => {
                  setAsking(false);
                  setTyped("");
                }}
              >
                Keep my account
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
