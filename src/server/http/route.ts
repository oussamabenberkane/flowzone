import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { type ApiErrorBody, ERROR_STATUS, buildErrorBody } from "@/shared/errors";
import { requireUser } from "@/server/auth/session";
import type { UserContext } from "@/server/auth/user-context";
import { type UserScope, forUser } from "@/server/db/scoped";
import { logError } from "@/server/log";
import { ApiError, badRequest, issuesFromZod, validationFailed } from "./errors";

/**
 * The request-context helper every API route uses.
 *
 *   // src/app/api/things/route.ts
 *   export const GET = userRoute(async ({ user, scope }) => {
 *     const things = await scope.list(thingsTable);
 *     return ok({ things });
 *   });
 *
 *   export const POST = userRoute(async ({ req, scope }) => {
 *     const body = await readJson(req, createThingSchema);   // 400 validation_failed on bad input
 *     const { row, created } = await scope.create(thingsTable, body, { clientRequestId: body.clientRequestId });
 *     return created ? createdJson(row) : ok(row);           // 201 first time, 200 on a retry
 *   });
 *
 * `userRoute` : requires a signed-in, allowed user (else the standard 401 / 403) and hands you
 *               `user` and a `scope` confined to that user. THE default for data routes.
 * `publicRoute`: no sign-in required (health checks and similar). Never touches user data.
 *
 * Both turn thrown errors into the standard error response and log unexpected ones
 * (type and code only, never content).
 */

type RouteParams = Record<string, string | string[] | undefined>;

export interface RouteArgs<P extends RouteParams = RouteParams> {
  req: NextRequest;
  /** Dynamic route segments, already awaited. */
  params: P;
  /** Appears in error responses and in server logs for this request. */
  traceId: string;
}

export interface UserRouteArgs<P extends RouteParams = RouteParams> extends RouteArgs<P> {
  user: UserContext;
  scope: UserScope;
}

type RouteContext<P> = { params: Promise<P> };

/** Responses are per-person data: never let a shared cache keep them. */
const NO_STORE = { "Cache-Control": "private, no-store" };

export function ok(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export function createdJson(data: unknown, init: ResponseInit = {}): Response {
  return ok(data, { ...init, status: 201 });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** Parse and validate a JSON body. Throws the standard 400 on malformed or invalid input. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("That request body couldn't be read as JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  return parsed.data;
}

/** Validate URL query parameters (`?limit=20`) with a Zod schema. */
export function readQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  return parsed.data;
}

export function errorResponse(
  code: keyof typeof ERROR_STATUS,
  traceId: string,
  options?: Parameters<typeof buildErrorBody>[2],
): Response {
  const body: ApiErrorBody = buildErrorBody(code, traceId, options);
  return Response.json(body, { status: ERROR_STATUS[code], headers: NO_STORE });
}

/** Next.js uses thrown errors for redirect() / notFound(); those must pass through untouched. */
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

function toErrorResponse(error: unknown, traceId: string, req: Request): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, traceId, { message: error.message, details: error.details });
  }
  if (error instanceof z.ZodError) {
    return errorResponse("validation_failed", traceId, { details: issuesFromZod(error) });
  }
  // Unexpected: log what is safe (names and codes, no content), tell the person nothing internal.
  logError("api.unhandled_error", error, { traceId, route: new URL(req.url).pathname });
  return errorResponse("internal_error", traceId);
}

async function run<P extends RouteParams>(
  req: NextRequest,
  routeContext: RouteContext<P> | undefined,
  work: (args: RouteArgs<P>) => Promise<Response>,
): Promise<Response> {
  const traceId = crypto.randomUUID();
  try {
    const params = (await routeContext?.params) ?? ({} as P);
    return await work({ req, params, traceId });
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return toErrorResponse(error, traceId, req);
  }
}

export function publicRoute<P extends RouteParams = RouteParams>(
  handler: (args: RouteArgs<P>) => Promise<Response>,
) {
  return (req: NextRequest, routeContext?: RouteContext<P>) => run(req, routeContext, handler);
}

export function userRoute<P extends RouteParams = RouteParams>(
  handler: (args: UserRouteArgs<P>) => Promise<Response>,
) {
  return (req: NextRequest, routeContext?: RouteContext<P>) =>
    run(req, routeContext, async (args) => {
      const user = await requireUser(req.headers);
      return handler({ ...args, user, scope: forUser(user) });
    });
}
