import "server-only";
import type { ServiceContext } from "../context";
import { coreLifecycleHandler } from "./core";

/**
 * THE data lifecycle registry: the single list every export and every account deletion
 * goes through. Each domain contributes one handler with two jobs:
 *
 *   exportFiles(ctx)  readable files for the person's export (structured data as JSON,
 *                     and readable text such as Markdown for notes and journal)
 *   deleteData(ctx)   removes everything this domain stores for the person, including
 *                     anything outside the database (for example push subscriptions)
 *
 * Rows in tables with a user_id column are removed automatically when the account is
 * deleted (ON DELETE CASCADE). Handlers still delete their own rows explicitly, so that
 * deletion stays complete if a cascade is ever changed, and so external stores are covered.
 *
 * To register a handler: create the module, export a LifecycleHandler, and add it to
 * LIFECYCLE_HANDLERS below. Full steps: docs/contracts/api.md, "Data lifecycle registry".
 */

export interface ExportFile {
  /** Path inside the export, with forward slashes. No leading "/" and no "..". */
  path: string;
  /** UTF-8 text. */
  content: string;
}

export interface LifecycleHandler {
  /** Unique, stable id, for example "core" or "ai.chat". */
  readonly id: string;
  /** A short human title, listed in the export's README. */
  readonly title: string;
  exportFiles(ctx: ServiceContext): Promise<ExportFile[]>;
  deleteData(ctx: ServiceContext): Promise<void>;
}

/** Handlers in the order they run. Core is first; AI and Nudges append their own. */
export const LIFECYCLE_HANDLERS: readonly LifecycleHandler[] = [coreLifecycleHandler];

const SAFE_PATH = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\\\u0000]+$/;

/** Checks an export path: relative, forward-slashed, no traversal. */
export function isSafeExportPath(path: string): boolean {
  return SAFE_PATH.test(path) && path.length <= 200;
}
