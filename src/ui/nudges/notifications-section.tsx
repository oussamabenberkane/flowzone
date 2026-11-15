"use client";

/**
 * Settings → notifications. Fills the `notifications-section` slot. Shown only once the `nudges`
 * switch is on, so the permission request never appears on first load. Contract:
 * docs/contracts/nudges.md, section 9; docs/contracts/design-system.md, section 8.
 */
import { useEffect, useState } from "react";
import { ApiRequestError, messageFor } from "@/ui/api/client";
import { getSettings } from "@/ui/api/resources";
import { invalidate, useQuery } from "@/ui/data/query";
import { dayLabel } from "@/ui/format";
import { localDay } from "./local-day";
import { Button, LoadingLine, Notice } from "@/ui/primitives";
import { useToast } from "@/ui/toast";
import { addNudgeDevice, getNudgeDevices, removeNudgeDevice, sendNudgeTest } from "./nudges-api";
import {
  deviceLabel,
  isInstalled,
  isIOS,
  pushSupported,
  sha256Hex,
  vapidKeyBytes,
} from "./platform";
import type { NudgeDeviceView, NudgeDevicesView } from "@/shared/nudges";

const DEVICES_KEY = "nudge-devices";
const REGISTRATION_WAIT_MS = 3000;

/** What this browser can do right now, read from the browser itself. */
type BrowserState =
  | { kind: "checking" }
  | { kind: "install" }
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "ready"; subscribed: boolean; thisEndpointHash: string | null };

export function NotificationsSection() {
  const settings = useQuery("settings", getSettings);
  if (settings.data === undefined) return null;
  if (!settings.data.consent.nudges.enabled) return null;

  return (
    <section className="fz-section" aria-labelledby="notifications-title">
      <h2 id="notifications-title">Notifications on this device</h2>
      <p className="fz-muted" style={{ margin: "var(--space-1) 0 var(--space-4)" }}>
        FlowZone sends a short note only when something on your list needs a look, and never during
        your quiet hours.
      </p>
      <NotificationsPanel />
    </section>
  );
}

function NotificationsPanel() {
  const devices = useQuery(DEVICES_KEY, getNudgeDevices);
  const toast = useToast();
  const [browser, setBrowser] = useState<BrowserState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Read the browser again after each change (permission, subscription, device list).
  const refreshBrowser = () => readBrowserState().then(setBrowser);

  useEffect(() => {
    let cancelled = false;
    void readBrowserState().then((state) => {
      if (!cancelled) setBrowser(state);
    });
    return () => {
      cancelled = true;
    };
  }, [devices.data]);

  if (devices.status === "loading" && devices.data === undefined) return <LoadingLine />;
  const view = devices.data;
  if (view === undefined)
    return (
      <Notice tone="problem" role="alert">
        {messageFor(devices.error)}
      </Notice>
    );

  async function allowHere() {
    setBusy(true);
    setProblem(null);
    try {
      // The permission request is the first thing this handler does, so it stays a direct response
      // to the person's tap (browsers require that).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refreshBrowser();
        return;
      }
      const fresh = await getNudgeDevices();
      if (!fresh.publicKey) throw new Error("This server has no notification key yet.");
      const registration = await withRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(fresh.publicKey),
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("The browser returned an incomplete subscription.");
      }
      await addNudgeDevice({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        label: deviceLabel(),
      });
      toast.show("Saved.");
      await invalidate(DEVICES_KEY);
      await refreshBrowser();
    } catch (error) {
      // Server answers are shown as they are; anything the browser refused gets one calm sentence.
      setProblem(
        error instanceof ApiRequestError
          ? messageFor(error)
          : "This device couldn't be set up for notifications. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(device: NudgeDeviceView) {
    setBusy(true);
    setProblem(null);
    try {
      await removeNudgeDevice(device.id);
      if (device.endpointHash === browserEndpointHash(browser)) {
        const registration = await withRegistration();
        const subscription = await registration.pushManager.getSubscription();
        await subscription?.unsubscribe();
      }
      toast.show("Removed.");
      await invalidate(DEVICES_KEY);
      await refreshBrowser();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setProblem(null);
    try {
      const count = await sendNudgeTest();
      if (count.delivered > 0) {
        toast.show("Sent. It should arrive in a moment.");
      } else {
        setProblem(
          "That didn't reach this device. Check that notifications are allowed for FlowZone in this browser.",
        );
      }
      if (count.gone > 0) await invalidate(DEVICES_KEY);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fz-stack">
      {!view.configured ? (
        <Notice>
          Notifications aren&apos;t set up on this server yet. Everything else in FlowZone works as
          usual.
        </Notice>
      ) : null}

      {browser.kind === "install" ? <InstallGuide /> : null}
      {browser.kind === "unsupported" ? (
        <Notice>
          This browser can&apos;t send notifications. Everything else in FlowZone works as usual.
        </Notice>
      ) : null}
      {browser.kind === "denied" ? (
        <Notice>
          Notifications are blocked for FlowZone in this browser. You can allow them in the
          browser&apos;s site settings. Everything else still works.
        </Notice>
      ) : null}

      {view.configured && browser.kind === "ready" && !browser.subscribed ? (
        <div className="fz-row">
          <Button variant="soft" onClick={() => void allowHere()} disabled={busy}>
            Allow notifications on this device
          </Button>
        </div>
      ) : null}

      {view.configured && browser.kind === "ready" && browser.subscribed ? (
        <div className="fz-row">
          <p style={{ margin: 0 }}>Notifications are on for this device.</p>
          <Button variant="line" small onClick={() => void sendTest()} disabled={busy}>
            Send a test notification
          </Button>
        </div>
      ) : null}

      {problem ? (
        <Notice tone="problem" role="alert">
          {problem}
        </Notice>
      ) : null}

      <DeviceList
        view={view}
        thisEndpointHash={browserEndpointHash(browser)}
        busy={busy}
        onRemove={(device) => void removeDevice(device)}
      />
    </div>
  );
}

function DeviceList({
  view,
  thisEndpointHash,
  busy,
  onRemove,
}: {
  view: NudgeDevicesView;
  thisEndpointHash: string | null;
  busy: boolean;
  onRemove: (device: NudgeDeviceView) => void;
}) {
  if (view.devices.length === 0) {
    return <p className="fz-muted">No devices yet.</p>;
  }
  return (
    <section aria-labelledby="devices-title" className="fz-stack">
      <h3 id="devices-title">Your devices</h3>
      <ul className="fz-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {view.devices.map((device) => {
          const mine = device.endpointHash === thisEndpointHash;
          return (
            <li key={device.id} className="fz-row" style={{ justifyContent: "space-between" }}>
              <span>
                {device.label}
                {mine ? " (this device)" : ""}
                <span className="fz-muted" style={{ display: "block" }}>
                  Added {dayLabel(localDay(device.createdAt), null)}
                </span>
              </span>
              <Button
                variant="line"
                small
                onClick={() => onRemove(device)}
                disabled={busy}
                aria-label={`Remove ${device.label}${mine ? " (this device)" : ""}`}
              >
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Steps for an iPhone where FlowZone is not on the Home Screen yet. Push cannot work before that. */
function InstallGuide() {
  return (
    <section className="fz-stack" aria-labelledby="install-title">
      <h3 id="install-title">Get notifications on iPhone</h3>
      <p className="fz-muted" style={{ margin: 0 }}>
        On iPhone, notifications only work once FlowZone is on your Home Screen. This needs iOS 16.4
        or later.
      </p>
      <ol className="fz-stack" style={{ paddingLeft: "var(--space-5)", margin: 0 }}>
        <li>Open FlowZone in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Choose Add to Home Screen.</li>
        <li>Open FlowZone from your Home Screen, then come back to this page.</li>
      </ol>
    </section>
  );
}

/* ----- Browser state, read from the browser ----- */

async function readBrowserState(): Promise<BrowserState> {
  if (isIOS() && !isInstalled()) return { kind: "install" };
  if (!pushSupported()) return { kind: "unsupported" };
  if (Notification.permission === "denied") return { kind: "denied" };
  const registration = await withRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return {
    kind: "ready",
    subscribed: subscription !== null,
    thisEndpointHash: subscription ? await sha256Hex(subscription.endpoint) : null,
  };
}

function browserEndpointHash(state: BrowserState): string | null {
  return state.kind === "ready" ? state.thisEndpointHash : null;
}

/** The service worker registration, once it is active. Waits a few seconds, then gives up. */
async function withRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The app is still starting. Try again in a moment.")),
      REGISTRATION_WAIT_MS,
    );
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
