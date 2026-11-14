import { z } from "zod";

/**
 * Idempotent creates.
 *
 * Any request that creates something the user could accidentally create twice
 * (a retry after a bad connection, an offline queue replaying) carries a
 * client-generated `clientRequestId` in the JSON body. Generate a fresh UUID
 * (`crypto.randomUUID()`) per user action and reuse the SAME value when retrying
 * that action.
 *
 * Server behaviour (implemented once, in the scoped data layer):
 *   - first time the id is seen for this user   -> row created, HTTP 201
 *   - the id was already used by this user      -> the existing row is returned, HTTP 200,
 *                                                  nothing is duplicated, no error
 * The id is scoped per user, so two users can never collide with each other.
 *
 * See docs/contracts/foundation.md.
 */
export const clientRequestIdSchema = z
  .string()
  .min(8, "Request id is too short")
  .max(100, "Request id is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Request id may only contain letters, numbers, - and _");

/** Reusable piece for create-request schemas: `z.object({ title: …, ...idempotentCreate })`. */
export const idempotentCreate = {
  clientRequestId: clientRequestIdSchema.optional(),
};

export type ClientRequestId = z.infer<typeof clientRequestIdSchema>;
