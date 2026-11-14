/**
 * DEVELOPMENT ONLY: fills the two allowed accounts with realistic sample data.
 *
 *   npm run script -- scripts/seed.ts
 *
 * - Refuses to run unless the environment is development or test (APP_ENV), and refuses
 *   on Vercel. Point DATABASE_URL at your development branch, never production.
 * - Uses the first two emails in ALLOWED_EMAILS. Creates their sign-in records if they do
 *   not exist yet (a later Google sign-in links to the same record).
 * - Replaces their core data (tasks, projects, notes, plans, settings) with the sample set.
 *   Other people's data is never touched.
 * - Dates are relative to today in each account's time zone, so the sample always shows
 *   due-today, due-soon, need-a-fresh-look and consecutive-skip cases.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DEVELOPMENT_ENVIRONMENTS = ["development", "test"] as const;
const DAY_MS = 86_400_000;

async function main(): Promise<void> {
  // Imported after the environment is loaded: the server settings are read on import.
  const { detectAppEnv, env } = await import("@/server/env");
  const appEnv = detectAppEnv();
  if (process.env.VERCEL || !(DEVELOPMENT_ENVIRONMENTS as readonly string[]).includes(appEnv)) {
    throw new Error(
      "The seed script only runs in a development or test environment (APP_ENV=development or test), never on Vercel or in production.",
    );
  }

  const { randomUUID } = await import("node:crypto");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/server/db/raw");
  const { user, tasks } = await import("@/server/db/schema");
  const { contextForUser } = await import("@/server/auth/system-context");
  const { createServiceContext } = await import("@/services/context");
  const { coreLifecycleHandler } = await import("@/services/lifecycle/core");
  const { createProject } = await import("@/services/projects");
  const { breakDownTask, completeTask, createTask } = await import("@/services/tasks");
  const { createEntry } = await import("@/services/entries");
  const { putPlan } = await import("@/services/today");
  const { updateSettings } = await import("@/services/settings");
  const { patchFor } = await import("@/services/db-types");
  const { addDays } = await import("@/shared/calendar");

  const emails = [...env.allowedEmails].slice(0, 2);
  if (emails.length === 0) throw new Error("ALLOWED_EMAILS lists no accounts to seed.");

  for (const email of emails) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!existing) {
      await db.insert(user).values({
        id: randomUUID(),
        email,
        name: email.split("@")[0] ?? "Sample",
        emailVerified: true,
      });
    }
  }

  const records = await db.select({ id: user.id, email: user.email }).from(user);
  for (const email of emails) {
    const record = records.find((row) => row.email === email);
    if (!record) throw new Error("The sample account could not be created.");
    const ctx = await createServiceContext(await contextForUser(record.id));

    // Replace the sample set: the person's own core data only.
    await coreLifecycleHandler.deleteData(ctx);
    await updateSettings(ctx, { firstRunCompleted: true });

    const home = (await createProject(ctx, { name: "Home" })).project;
    const work = (await createProject(ctx, { name: "Work" })).project;

    // Inbox: no project.
    await createTask(ctx, { title: "Buy oat milk" });
    await createTask(ctx, { title: "Look into a dentist appointment", priority: "low" });

    // Work
    const brief = (
      await createTask(ctx, {
        title: "Draft the project brief",
        projectId: work.id,
        dueDate: ctx.today,
        priority: "high",
        status: "in_progress",
        estimateMinutes: 90,
        energy: "high",
      })
    ).task;
    await createTask(ctx, {
      title: "Reply to Sam about the budget",
      projectId: work.id,
      dueDate: addDays(ctx.today, 1),
      dueTime: "10:00",
      priority: "high",
    });
    await createTask(ctx, {
      title: "Team check-in",
      projectId: work.id,
      recurrence: { rule: { type: "weekly", days: [1, 3] }, startDate: addDays(ctx.today, -14) },
    });

    // Home
    const tap = (
      await createTask(ctx, {
        title: "Fix the bathroom tap",
        projectId: home.id,
        dueDate: addDays(ctx.today, -3),
        energy: "high",
        estimateMinutes: 45,
      })
    ).task;
    const winter = (await createTask(ctx, { title: "Sort the winter clothes", projectId: home.id }))
      .task;
    // Untouched for a while, so it shows up in the fresh-look queue.
    await ctx.scope.updateById(
      tasks,
      winter.id,
      patchFor<typeof tasks>({ lastActivityAt: new Date(ctx.now.getTime() - 12 * DAY_MS) }),
    );
    await createTask(ctx, {
      title: "Water the plants",
      projectId: home.id,
      recurrence: {
        rule: { type: "every_n_days", interval: 2 },
        startDate: addDays(ctx.today, -4),
      },
      dueTime: "18:00",
    });

    // A repeating habit nobody has done for a while: the consecutive-skip flag shows.
    await createTask(ctx, {
      title: "Take vitamins",
      recurrence: { rule: { type: "daily" }, startDate: addDays(ctx.today, -6) },
      dueTime: "08:00",
    });

    // A larger task, broken into steps.
    const trip = (
      await createTask(ctx, {
        title: "Plan the weekend trip",
        dueDate: addDays(ctx.today, 6),
      })
    ).task;
    await breakDownTask(ctx, trip.id, {
      steps: [
        { title: "Pick two dates" },
        { title: "Check the train times" },
        { title: "Book a place to stay" },
      ],
    });

    // Done today.
    const bill = (await createTask(ctx, { title: "Pay the electricity bill" })).task;
    await completeTask(ctx, bill.id, {});

    // Notes and journal.
    await createEntry(ctx, {
      kind: "note",
      title: "Brief outline",
      body: "Three sections: context, the proposal and the timeline. Keep it to two pages.",
      taskId: brief.id,
      projectId: work.id,
    });
    await createEntry(ctx, {
      kind: "journal",
      body: "A slow walk after lunch helped. Felt calmer than yesterday.",
      entryDate: ctx.today,
    });
    await createEntry(ctx, {
      kind: "journal",
      body: "Too many tabs open. Closed half of them and it helped.",
      entryDate: addDays(ctx.today, -1),
    });

    // Today's plan, not yet confirmed.
    await putPlan(ctx, ctx.today, { taskIds: [brief.id, tap.id] });

    console.log(`Seeded the sample set for one account (${appEnv}).`);
  }
  console.log(`Done: ${emails.length} account(s). Run this again to start from the sample set.`);
}

main().catch((error: unknown) => {
  // Name the error type and message only: never print personal details.
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed (${name}): ${message}`);
  process.exit(1);
});
