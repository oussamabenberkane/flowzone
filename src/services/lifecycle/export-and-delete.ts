import "server-only";
import { deleteAccountRecord } from "@/server/auth/account";
import type { ServiceContext } from "../context";
import { buildZip, type ZipEntry } from "./zip";
import { LIFECYCLE_HANDLERS, type ExportFile, isSafeExportPath } from "./registry";

/**
 * Runs the registry: builds the one-download export, and deletes an account.
 */

const FORMAT_VERSION = 1;

function readme(handlerTitles: readonly string[], timeZone: string, exportedOn: string): string {
  return [
    "FlowZone export",
    "===============",
    "",
    `Exported on ${exportedOn} (time zone: ${timeZone}).`,
    "",
    "What is in here:",
    "  readable/   the same information written for reading: tasks and notes/journal",
    "  data/       the same information as structured JSON, for other tools",
    "  manifest.json  the export format version and what each part covers",
    "",
    "Parts of this export:",
    ...handlerTitles.map((title) => `  - ${title}`),
    "",
    "Dates are calendar dates in your time zone. Times are 24-hour (HH:MM).",
    "Nothing in this file is encrypted: keep it private.",
    "",
  ].join("\n");
}

/** Builds the single ZIP download with every handler's files. */
export async function buildExportArchive(ctx: ServiceContext): Promise<Buffer> {
  const files: ExportFile[] = [];
  const seen = new Set<string>();
  for (const handler of LIFECYCLE_HANDLERS) {
    for (const file of await handler.exportFiles(ctx)) {
      if (!isSafeExportPath(file.path) || seen.has(file.path)) {
        throw new Error(`Export path rejected by the registry: ${file.path}`);
      }
      seen.add(file.path);
      files.push(file);
    }
  }

  const exportedOn = ctx.today;
  const manifest = {
    format: "flowzone-export",
    version: FORMAT_VERSION,
    exportedOn,
    timeZone: ctx.timeZone,
    parts: LIFECYCLE_HANDLERS.map((handler) => ({ id: handler.id, title: handler.title })),
    files: files.map((file) => file.path),
  };

  const entries: ZipEntry[] = [
    {
      name: "README.txt",
      data: Buffer.from(
        readme(
          LIFECYCLE_HANDLERS.map((h) => h.title),
          ctx.timeZone,
          exportedOn,
        ),
        "utf8",
      ),
    },
    { name: "manifest.json", data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8") },
    ...files.map((file) => ({ name: file.path, data: Buffer.from(file.content, "utf8") })),
  ];
  return buildZip(entries, ctx.now);
}

/**
 * Deletes everything the person has. Every registered handler runs first, then the sign-in
 * record is removed, which cascades to every user-owned row. Safe to retry: each step
 * deletes what is left.
 */
export async function deleteAccount(ctx: ServiceContext): Promise<void> {
  for (const handler of LIFECYCLE_HANDLERS) {
    await handler.deleteData(ctx);
  }
  await deleteAccountRecord(ctx.user.userId);
}
