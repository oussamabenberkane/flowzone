"use client";

/**
 * Settings. The look-and-feel controls are the Frontend Core's embeddable set. The AI choices,
 * profile, time zone and quiet hours, chat history and data sections fill `settings-sections`
 * (built in src/ui/ai). `notifications-section` is left open for the Nudges agent.
 */
import { AccessibilityControls } from "@/ui/a11y/controls";
import { SettingsSections } from "@/ui/ai/settings-sections";
import { ExtensionSlot } from "@/ui/extensions/slots";
import { NotificationsSection } from "@/ui/nudges/notifications-section";
import { SignOutButton } from "@/ui/sign-out-button";
import { ScreenTitle } from "@/ui/primitives";

export function SettingsScreen() {
  return (
    <>
      <ScreenTitle
        title="Settings"
        detail="Each choice takes effect straight away. Nothing here is required to use FlowZone."
      />

      <section className="fz-section" aria-labelledby="look-title">
        <h2 id="look-title">Look and feel</h2>
        <p className="fz-muted" style={{ margin: "var(--space-1) 0 var(--space-4)" }}>
          These are saved on this device and follow the device&apos;s own settings for light and
          dark.
        </p>
        <AccessibilityControls />
      </section>

      <ExtensionSlot name="settings-sections">
        <SettingsSections />
      </ExtensionSlot>
      <ExtensionSlot name="notifications-section">
        <NotificationsSection />
      </ExtensionSlot>

      <section className="fz-section" aria-labelledby="account-title">
        <h2 id="account-title">Account</h2>
        <div style={{ marginTop: "var(--space-3)" }}>
          <SignOutButton />
        </div>
      </section>
    </>
  );
}
