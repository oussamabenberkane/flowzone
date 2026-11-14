import "server-only";
import { and, isNull, sql } from "drizzle-orm";
import { validationFailed } from "@/server/http/errors";
import { entries, tasks } from "@/server/db/schema";
import type { SearchResultView } from "@/shared/views";
import type { ServiceContext } from "./context";
import { entryView, taskViews } from "./views";

/**
 * Full-text search over task titles and entry text (Postgres full-text search, "simple"
 * configuration so it works for any language). Every word is matched as a prefix, so
 * "gro" finds "groceries". Usable by the AI agent through the service layer.
 *
 * The expressions below must match the GIN indexes in the migration exactly, so the
 * database can use them.
 */

/** Turns free text into a safe tsquery: letters and digits only, each word a prefix, all required. */
export function toTsQuery(text: string): string | null {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return null;
  return words.map((word) => `${word.toLowerCase()}:*`).join(" & ");
}

export async function search(
  ctx: ServiceContext,
  text: string,
  limit: number,
): Promise<SearchResultView> {
  const query = toTsQuery(text);
  if (query === null) {
    throw validationFailed([{ field: "q", message: "Type a word to search for." }]);
  }

  const taskRows = await ctx.scope.list(tasks, {
    where: and(
      isNull(tasks.droppedAt),
      sql`to_tsvector('simple', ${tasks.title}) @@ to_tsquery('simple', ${query})`,
    ),
    orderBy: sql`ts_rank(to_tsvector('simple', ${tasks.title}), to_tsquery('simple', ${query})) desc`,
    limit,
  });

  const entryRows = await ctx.scope.list(entries, {
    where: sql`to_tsvector('simple', coalesce(${entries.title}, '') || ' ' || ${entries.body}) @@ to_tsquery('simple', ${query})`,
    orderBy: sql`ts_rank(to_tsvector('simple', coalesce(${entries.title}, '') || ' ' || ${entries.body}), to_tsquery('simple', ${query})) desc`,
    limit,
  });

  return {
    tasks: await taskViews(ctx, taskRows),
    entries: entryRows.map(entryView),
  };
}
