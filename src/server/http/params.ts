import "server-only";
import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar";
import { badRequest, notFound, validationFailed, issuesFromZod } from "./errors";

/**
 * Helpers for the core API routes, on top of the Foundation helpers in ./route.ts.
 *   uuidParam(params.id)        an id that is not a valid UUID is simply "not found"
 *   dateParam(params.date)      a path date must be a real YYYY-MM-DD
 *   readOptionalJson(req, s)    an action endpoint whose body may be left out entirely
 */

const UUID = z.uuid();

export function uuidParam(value: string): string {
  if (!UUID.safeParse(value).success) throw notFound();
  return value;
}

export function dateParam(value: string): string {
  if (!isCalendarDate(value)) {
    throw validationFailed([{ field: "date", message: "Use a real date in the form YYYY-MM-DD." }]);
  }
  return value;
}

/** Like readJson, but an empty body counts as `{}`. */
export async function readOptionalJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const text = await req.text();
  let raw: unknown = {};
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      throw badRequest("That request body couldn't be read as JSON.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  return parsed.data;
}
