"use client";

/**
 * The app shell: the top bar with the always-available Capture button, navigation (a bottom
 * bar on phones, a side rail on wide screens), the offline and sync line, and the persistent
 * global-assistant area. Every signed-in screen lives inside it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getSettings, updateSettings } from "@/ui/api/resources";
import { invalidate, useQuery } from "@/ui/data/query";
import { authClient } from "@/ui/auth-client";
import {
  discardCapture,
  flushCaptures,
  setCaptureOwner,
  startCaptureSync,
  useCaptureQueue,
} from "@/ui/offline/capture-queue";
import { useOnline } from "@/ui/offline/connection";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { IconInbox, IconNotes, IconPlus, IconProjects, IconSettings, IconToday } from "@/ui/icons";
import { Button } from "@/ui/primitives";
import { ToastProvider } from "@/ui/toast";
import { TODAY_KEY, loadToday } from "@/ui/today/today-data";
import { FirstRunChoices } from "@/ui/ai/first-run";
import { GlobalAssistant } from "@/ui/ai/assistant";
import { useAi } from "@/ui/ai/use-ai";
import { QuickAddProvider, useQuickAdd } from "./quick-add";

const NAV = [
  { href: "/today", label: "Today", Icon: IconToday },
  { href: "/inbox", label: "Inbox", Icon: IconInbox },
  { href: "/projects", label: "Projects", Icon: IconProjects },
  { href: "/notes", label: "Notes", Icon: IconNotes },
  { href: "/settings", label: "Settings", Icon: IconSettings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ShellFrame>{children}</ShellFrame>
    </ToastProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  useFirstRunSetup();
  useCaptureOwnerAndSync();

  // The date comes from the server's Today, shared with the Today screen (one request, one cache).
  const todayQuery = useQuery(TODAY_KEY, loadToday);
  const today = todayQuery.data?.today.date ?? null;

  return (
    <QuickAddProvider today={today}>
      <a className="fz-skip" href="#main">
        Skip to content
      </a>
      <div className="fz-shell">
        <Navigation />
        <div style={{ minWidth: 0 }}>
          <Topbar />
          <SyncLine />
          <main id="main" className="fz-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <FirstRunChoices />
    </QuickAddProvider>
  );
}

/** Tells the offline queue who is signed in, and keeps syncing while the shell is open. */
function useCaptureOwnerAndSync() {
  useEffect(() => {
    let active = true;
    const stop = startCaptureSync();
    authClient
      .getSession()
      .then(({ data }) => {
        if (active) setCaptureOwner(data?.user?.id ?? null);
      })
      .catch(() => {
        if (active) setCaptureOwner(null);
      });
    return () => {
      active = false;
      stop();
    };
  }, []);
}

/**
 * Settings are created on first use. This sets the time zone from the device. It does not mark
 * the first run complete: the AI first-run choices (FirstRunChoices) do that once the person has
 * saved or skipped them, so the choices are shown exactly once.
 */
function useFirstRunSetup() {
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const settings = await getSettings();
        if (!active || settings.firstRunCompleted) return;
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timeZone !== settings.timeZone) await updateSettings({ timeZone });
        await invalidate(TODAY_KEY);
      } catch {
        // Offline or refused: try again on the next visit. Nothing else depends on it.
      }
    })();
    return () => {
      active = false;
    };
  }, []);
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Topbar() {
  const quickAdd = useQuickAdd();
  const ai = useAi();
  return (
    <div className="fz-topbar">
      <Link href="/today" className="fz-wordmark">
        FlowZone
      </Link>
      <div className="fz-topbar-actions">
        {/* Only offered once Tasks and chat is on. With AI off the top bar is the plain app. */}
        <ExtensionSlot name="global-assistant">
          {ai.features ? <GlobalAssistant /> : undefined}
        </ExtensionSlot>
        <Button small variant="soft" onClick={() => quickAdd.open()} data-testid="quick-add-button">
          <IconPlus aria-hidden="true" width={18} height={18} />
          Capture
        </Button>
      </div>
    </div>
  );
}

/**
 * The one navigation. A bottom bar on phones (fixed), a side rail on wide screens (see
 * globals.css). It is rendered once, so there is one set of links for people and for tests.
 */
function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="fz-nav" aria-label="Sections">
      <div className="fz-rail-brand" aria-hidden="true">
        FlowZone
      </div>
      <ul className="fz-nav-list">
        {NAV.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A quiet line under the top bar: offline, or captures waiting to be sent. */
function SyncLine() {
  const online = useOnline();
  const queue = useCaptureQueue();
  const count = queue.items.length;
  const refused = queue.items.find((item) => item.problem);

  if (!online && count === 0) {
    return (
      <p className="fz-sync" role="status" data-testid="offline-line">
        You&apos;re offline. Today still opens from this device, and anything you add waits here.
      </p>
    );
  }
  if (count === 0) return null;

  if (refused) {
    return (
      <div
        className="fz-sync"
        role="status"
        data-testid="sync-line"
        style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}
      >
        <span>
          {count === 1 ? "One saved capture" : `${count} saved captures`} couldn&apos;t be sent yet.{" "}
          {refused.problem}
        </span>
        <Button variant="quiet" small onClick={() => void flushCaptures()}>
          Try again
        </Button>
        <Button variant="line" small onClick={() => void discardCapture(refused.clientRequestId)}>
          Discard this one
        </Button>
      </div>
    );
  }

  return (
    <p className="fz-sync" role="status" data-testid="sync-line">
      {queue.syncing
        ? "Sending what you saved on this device…"
        : count === 1
          ? "One thing saved on this device, waiting to be sent."
          : `${count} things saved on this device, waiting to be sent.`}
    </p>
  );
}
