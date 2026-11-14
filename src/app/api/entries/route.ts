import { createEntrySchema, listEntriesQuery } from "@/shared/api-schemas";
import { createServiceContext } from "@/services/context";
import { createEntry, listEntries } from "@/services/entries";
import { createdJson, ok, readJson, readQuery, userRoute } from "@/server/http/route";

/** GET /api/entries: notes and journal, newest day first. Filter by kind, task, project or date. */
export const GET = userRoute(async ({ req, user }) => {
  const query = readQuery(req, listEntriesQuery);
  const ctx = await createServiceContext(user);
  return ok(await listEntries(ctx, query));
});

/** POST /api/entries: create a note or a journal entry. Retries with the same clientRequestId are safe. */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, createEntrySchema);
  const ctx = await createServiceContext(user);
  const { entry, created } = await createEntry(ctx, body);
  return created ? createdJson(entry) : ok(entry);
});
