import { createServiceContext } from "@/services/context";
import { buildExportArchive } from "@/services/lifecycle/export-and-delete";
import { userRoute } from "@/server/http/route";

/**
 * GET /api/account/export: one ZIP download with everything the person has, readable
 * (Markdown and text) and structured (JSON). Built from the lifecycle registry.
 */
export const GET = userRoute(async ({ user }) => {
  const ctx = await createServiceContext(user);
  const archive = await buildExportArchive(ctx);
  const filename = `flowzone-export-${ctx.today}.zip`;
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
