"use client";

/**
 * What this browser can do for notifications, and how to name the device. Browser-only helpers.
 * Contract: docs/contracts/nudges.md, section 9. Notes on iOS: web push needs iOS 16.4 or later and
 * the app added to the Home Screen; the browser tab itself has no push API.
 */

/** iPhone, iPad and iPod, including iPadOS, which reports itself as a Mac with touch. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || touchMac;
}

/** True when the app is running from the Home Screen (or the browser's own app window). */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches === true;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

/** True when the browser offers the three APIs notifications need. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** A short device label such as "Android · Chrome". It never includes a version or an identifier. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = isIOS()
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "This device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  return browser ? `${os} · ${browser}` : os;
}

/** SHA-256 of a string, in hex. Matches the server's hash of the push endpoint. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Converts the public key (base64url) into the bytes the browser's subscribe call expects. */
export function vapidKeyBytes(publicKey: string): ArrayBuffer {
  const padded = publicKey
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(publicKey.length / 4) * 4, "=");
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return buffer;
}
