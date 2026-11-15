/**
 * A local HTTPS stand-in for a browser push service, used only by the suite.
 *
 *   POST https://localhost:<port>/push/ok/<id>    -> 201 (delivered)
 *   POST https://localhost:<port>/push/gone/<id>  -> 410 (the subscription has ended)
 *   POST https://localhost:<port>/push/fail/<id>  -> 500 (a failed send)
 *
 * Each request is appended to e2e/.tmp/pushes.jsonl with its (still encrypted) body, so
 * tests running in other worker processes can read what was "sent" and decrypt it with
 * the device keys they created (see push-decrypt.ts). Nothing leaves this machine.
 */
import { createServer, type Server } from "node:https";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureTestCertificate, PUSH_STUB_PORT, TMP_DIR } from "./env";

export const PUSH_LOG = path.join(TMP_DIR, "pushes.jsonl");

export interface PushRecord {
  id: string;
  mode: "ok" | "gone" | "fail";
  status: number;
  at: string;
  /** The encrypted push body, base64. */
  body: string;
}

const STATUS_BY_MODE: Record<PushRecord["mode"], number> = { ok: 201, gone: 410, fail: 500 };

export function startPushStub(): Promise<{ close: () => Promise<void> }> {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(PUSH_LOG, "");
  const { certPath, keyPath } = ensureTestCertificate();

  const server: Server = createServer(
    { cert: readFileSync(certPath), key: readFileSync(keyPath) },
    (req, res) => {
      const match = /^\/push\/(ok|gone|fail)\/([A-Za-z0-9-]+)$/.exec(req.url ?? "");
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        if (!match || req.method !== "POST") {
          res.writeHead(404).end();
          return;
        }
        const mode = match[1] as PushRecord["mode"];
        const status = STATUS_BY_MODE[mode];
        const record: PushRecord = {
          id: match[2],
          mode,
          status,
          at: new Date().toISOString(),
          body: Buffer.concat(chunks).toString("base64"),
        };
        appendFileSync(PUSH_LOG, `${JSON.stringify(record)}\n`);
        res.writeHead(status).end();
      });
    },
  );

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PUSH_STUB_PORT, "localhost", () => {
      resolve({
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

/** Every push the stub received for one device id, oldest first. */
export function pushesFor(id: string): PushRecord[] {
  let text = "";
  try {
    text = readFileSync(PUSH_LOG, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PushRecord)
    .filter((record) => record.id === id);
}
