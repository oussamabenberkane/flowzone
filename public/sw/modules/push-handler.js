/*
 * FlowZone push handler (owned by the Nudges agent). A classic script that runs inside the service
 * worker. Contract: docs/contracts/nudges.md, section 7, and docs/contracts/design-system.md,
 * section 8.1.
 *
 *   - push: shows the notification. Every push shows one, as the browser requires.
 *   - notificationclick: opens the task (or Today or Settings) the message is about.
 *   - two action buttons on nudges (where the platform shows them, for example Android Chrome):
 *       "Not today"           snoozes nudges about this task for a few days;
 *       "Stop for this task"  mutes nudges about this task.
 *     These change nudge behaviour only, never the task. If the request fails, the task opens so the
 *     person can act there.
 *
 * Nothing here logs or stores message content.
 */

const PUSH_FALLBACK_BODY = "FlowZone has a gentle note for you.";
const SNOOZE_ACTION = "snooze";
const MUTE_ACTION = "mute";

self.addEventListener("push", (event) => {
  event.waitUntil(showFromPush(event));
});

async function showFromPush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "FlowZone";
  const body =
    typeof data.body === "string" && data.body ? data.body.slice(0, 300) : PUSH_FALLBACK_BODY;
  const taskId = typeof data.taskId === "string" ? data.taskId : null;
  const isNudge = data.kind === "nudge" && taskId !== null;

  const actions = isNudge
    ? [
        { action: SNOOZE_ACTION, title: "Not today" },
        { action: MUTE_ACTION, title: "Stop for this task" },
      ]
    : [];

  await self.registration.showNotification(title, {
    body,
    tag: typeof data.tag === "string" ? data.tag : "flowzone",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      url: safePath(data.url),
      taskId,
      isNudge,
    },
    actions,
  });
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  const control =
    event.action === SNOOZE_ACTION ? "snoozed" : event.action === MUTE_ACTION ? "muted" : null;
  if (control !== null && data.taskId) {
    event.waitUntil(changeNudgeControl(data.taskId, control, data.url));
    return;
  }
  event.waitUntil(openPath(data.url));
});

/** Only relative paths inside the app are opened. Anything else falls back to Today. */
function safePath(value) {
  if (typeof value !== "string") return "/today";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/today";
}

async function changeNudgeControl(taskId, control, fallbackUrl) {
  const body = control === "muted" ? { muted: true } : { snoozed: true };
  try {
    const response = await fetch(`/api/nudges/tasks/${encodeURIComponent(taskId)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) await openPath(fallbackUrl);
  } catch {
    await openPath(fallbackUrl);
  }
}

async function openPath(path) {
  const url = new URL(safePath(path), self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    await client.focus();
    if ("navigate" in client) {
      try {
        await client.navigate(url);
        return;
      } catch {
        // Some browsers refuse to navigate a background window; open a new one instead.
      }
    }
    return;
  }
  await self.clients.openWindow(url);
}

/*
 * The browser can replace a push subscription (for example after its keys rotate). Subscribe again
 * and register the new one, so pushes keep arriving. The old one is removed on the server the next
 * time the push service reports it gone.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribe());
});

async function resubscribe() {
  try {
    const keyResponse = await fetch("/api/nudges/devices", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!keyResponse.ok) return;
    const { publicKey } = await keyResponse.json();
    if (!publicKey) return;

    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
    const json = subscription.toJSON();
    await fetch("/api/nudges/devices", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        label: "This device",
      }),
    });
  } catch {
    // Best effort. The person can always subscribe again from Settings.
  }
}

function base64UrlToBytes(value) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
