/**
 * Accessibility: automated axe scans of every screen in light and dark themes (WCAG 2.x A and AA),
 * a keyboard-only walkthrough of the main flow, and a check that reduced motion removes animation.
 *
 * axe finds many, but not all, accessibility problems. Keyboard and screen-reader use still need
 * a manual pass (docs/qa/coverage.md lists what remains manual).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { markFirstRunDone, openApp } from "./support/app";
import { createEntry, createProject, createTask, todayIso } from "./support/api";
import { expect, test, type Person } from "./support/fixtures";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Scheme = "light" | "dark";

async function scan(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "n/a"}): ${violation.help}; ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join(" | ")}`,
  );
}

/** Creates the data each screen needs, so every screen is scanned with real content. */
async function seedScreens(person: Person) {
  const project = await createProject(person.api, "Home admin");
  const task = await createTask(person.api, {
    title: "Renew the car insurance",
    dueDate: todayIso(),
    projectId: project.id,
    estimateMinutes: 30,
    energy: "medium",
  });
  const entry = await createEntry(person.api, {
    kind: "note",
    body: "Ask about the excess",
    taskId: task.id,
  });
  await markFirstRunDone(person.api);
  return { project, task, entry };
}

const SCREENS: Array<{
  name: string;
  path: (ids: Awaited<ReturnType<typeof seedScreens>>) => string;
}> = [
  { name: "Today", path: () => "/today" },
  { name: "Inbox", path: () => "/inbox" },
  { name: "Projects", path: () => "/projects" },
  { name: "Project detail", path: (ids) => `/projects/${ids.project.id}` },
  { name: "Task detail", path: (ids) => `/tasks/${ids.task.id}` },
  { name: "Focus", path: (ids) => `/focus/${ids.task.id}` },
  { name: "Notes", path: () => "/notes" },
  { name: "Note detail", path: (ids) => `/notes/${ids.entry.id}` },
  { name: "New journal entry", path: () => "/notes/new?kind=journal" },
  { name: "Settings", path: () => "/settings" },
];

for (const scheme of ["light", "dark"] as Scheme[]) {
  test.describe(`every screen passes automated checks in the ${scheme} theme`, () => {
    for (const screen of SCREENS) {
      test(`${screen.name} (${scheme})`, async ({ alice }) => {
        const ids = await seedScreens(alice);
        await alice.page.emulateMedia({ colorScheme: scheme });
        await openApp(alice, screen.path(ids), { keepFirstRun: false });
        await alice.page.waitForLoadState("networkidle");
        expect(await scan(alice.page)).toEqual([]);
      });
    }

    test(`the Capture sheet (${scheme})`, async ({ alice }) => {
      await seedScreens(alice);
      await alice.page.emulateMedia({ colorScheme: scheme });
      await openApp(alice, "/today");
      await alice.page.getByTestId("quick-add-button").click();
      await expect(alice.page.getByTestId("quick-add-input")).toBeFocused();
      expect(await scan(alice.page)).toEqual([]);
    });

    test(`the sign-in screen (${scheme})`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto("/sign-in");
      await expect(page.getByTestId("sign-in-google")).toBeVisible();
      expect(await scan(page)).toEqual([]);
      await context.close();
    });
  });
}

test.describe("keyboard-only use", () => {
  test("capture a task, find it in the Inbox and complete it, with the keyboard alone", async ({
    alice,
  }) => {
    await markFirstRunDone(alice.api);
    await alice.page.goto("/today");
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();

    // Reach the Capture button with Tab, open it with Enter.
    await tabTo(alice.page, alice.page.getByTestId("quick-add-button"));
    await alice.page.keyboard.press("Enter");
    await expect(alice.page.getByTestId("quick-add-input")).toBeFocused();
    await alice.page.keyboard.type("Water the ferns tomorrow");
    await expect(alice.page.getByTestId("quick-add-understood")).toBeVisible();

    await tabTo(alice.page, alice.page.getByTestId("quick-add-save"));
    await alice.page.keyboard.press("Enter");
    await expect(alice.page.getByRole("dialog")).toBeHidden();

    await tabTo(alice.page, alice.page.getByTestId("nav-inbox"));
    await alice.page.keyboard.press("Enter");
    await expect(alice.page).toHaveURL(/\/inbox$/);

    const row = alice.page.getByTestId("inbox-task").filter({ hasText: "Water the ferns" });
    await expect(row).toBeVisible();
    await tabTo(alice.page, row.getByRole("checkbox"));
    await alice.page.keyboard.press("Space");
    await expect(alice.page.getByText("Done.", { exact: true })).toBeVisible();
  });

  test("a sheet closes with Escape and focus returns to the button that opened it", async ({
    alice,
  }) => {
    await markFirstRunDone(alice.api);
    await alice.page.goto("/today");
    const button = alice.page.getByTestId("quick-add-button");
    await button.focus();
    await alice.page.keyboard.press("Enter");
    await expect(alice.page.getByRole("dialog")).toBeVisible();
    await alice.page.keyboard.press("Escape");
    await expect(alice.page.getByRole("dialog")).toBeHidden();
    await expect(button).toBeFocused();
  });
});

test.describe("reduced motion", () => {
  test("with the system's reduced-motion setting, the app's transitions and animations are removed", async ({
    alice,
  }) => {
    await markFirstRunDone(alice.api);
    await createTask(alice.api, { title: "Calm task", dueDate: todayIso() });
    await alice.page.emulateMedia({ reducedMotion: "reduce" });
    await alice.page.goto("/today");
    await expect(alice.page.getByTestId("nav-today")).toBeVisible();

    const moving = await alice.page.evaluate(() => {
      const seconds = (value: string) =>
        value.split(",").map((part) => {
          const trimmed = part.trim();
          return trimmed.endsWith("ms") ? parseFloat(trimmed) / 1000 : parseFloat(trimmed);
        });
      const offenders: string[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const style = getComputedStyle(element);
        const transitions = seconds(style.transitionDuration);
        const animations = seconds(style.animationDuration);
        const infinite = style.animationIterationCount === "infinite";
        if (
          transitions.some((value) => value > 0) ||
          (!infinite && animations.some((value) => value > 0))
        ) {
          offenders.push(`${element.tagName.toLowerCase()}.${element.className}`);
        }
      }
      return offenders.slice(0, 5);
    });
    expect(moving, "elements still animating under reduced motion").toEqual([]);
  });
});

/** Presses Tab until the target element has focus (keyboard-only navigation). */
async function tabTo(
  page: Page,
  target: import("@playwright/test").Locator,
  maxPresses = 60,
): Promise<void> {
  for (let i = 0; i < maxPresses; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("could not reach the target with the Tab key");
}
