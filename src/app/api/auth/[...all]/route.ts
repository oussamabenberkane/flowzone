import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

// Better Auth's own endpoints (Google sign-in, callback, session, sign-out, and the
// test-only login when enabled). They use Better Auth's response format, not our
// standard error shape.
export const { GET, POST } = toNextJsHandler(auth);
