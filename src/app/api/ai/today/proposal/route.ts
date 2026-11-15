import { ok, readJson, userRoute } from "@/server/http/route";
import { todayProposalBody } from "@/shared/ai-schemas";
import { createServiceContext } from "@/services/context";
import { todayProposal } from "@/services/ai/features";

/** Ranked 3 to 5 items for today, with a reason each. Nothing changes until the plan is confirmed. */
export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, todayProposalBody);
  const ctx = await createServiceContext(user);
  return ok(await todayProposal(ctx, body.energy));
});
