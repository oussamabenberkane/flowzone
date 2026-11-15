/**
 * Responsive layout on phone-sized (390 x 844) and desktop (1280 x 860) viewports. Runs in both
 * projects; the navigation check depends on which viewport the project uses.
 */
import { markFirstRunDone, openApp } from "./support/app";
import { createProject, createTask, todayIso } from "./support/api";
import { expect, test } from "./support/fixtures";

const SCREENS = ["/today", "/inbox", "/projects", "/notes", "/settings"];

/** True when the page is wider than its viewport (a horizontal scroll bar). */
async function hasHorizontalScroll(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

test.describe("responsive layout", () => {
  test("no main screen scrolls sideways, at the default text size", async ({ alice }) => {
    const project = await createProject(
      alice.api,
      "A project with a long, descriptive name for layout",
    );
    await createTask(alice.api, {
      title:
        "A long task title that keeps going so that it has to wrap onto several lines on a phone",
      dueDate: todayIso(),
      projectId: project.id,
    });
    await openApp(alice, "/today");
    for (const path of SCREENS) {
      await alice.page.goto(path);
      await expect(alice.page.getByTestId("nav-today")).toBeVisible();
      expect(await hasHorizontalScroll(alice.page), `horizontal scroll on ${path}`).toBe(false);
    }
  });

  test("no main screen scrolls sideways at the largest text size", async ({ alice }) => {
    await createTask(alice.api, {
      title: "Another long task title that should still fit the row at the largest text size",
      dueDate: todayIso(),
    });
    await markFirstRunDone(alice.api);
    await alice.page.goto("/settings");
    await alice.page
      .getByTestId("accessibility-controls")
      .getByText("Largest", { exact: true })
      .click();
    for (const path of ["/today", "/inbox", "/settings"]) {
      await alice.page.goto(path);
      await expect(alice.page.getByTestId("nav-today")).toBeVisible();
      expect(
        await hasHorizontalScroll(alice.page),
        `horizontal scroll at largest text on ${path}`,
      ).toBe(false);
    }
  });

  test("navigation sits in the bottom bar on phones and the side rail on desktop", async ({
    alice,
  }, testInfo) => {
    await openApp(alice, "/today");
    const box = await alice.page.getByTestId("nav-today").boundingBox();
    expect(box).not.toBeNull();
    const viewport = alice.page.viewportSize();
    expect(viewport).not.toBeNull();

    if (testInfo.project.name === "phone") {
      expect(box!.y, "the navigation should be at the bottom of a phone screen").toBeGreaterThan(
        (viewport!.height ?? 0) * 0.8,
      );
    } else {
      expect(box!.x, "the navigation should be a side rail on desktop").toBeLessThan(300);
      expect(box!.y).toBeLessThan((viewport!.height ?? 0) * 0.5);
    }
  });
});
