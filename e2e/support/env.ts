/**
 * Shared settings for the Playwright suite. Imported by the config (Node) and by
 * the tests. Nothing here is a secret: the database is a throwaway local container
 * and the tick and push values only exist for the duration of a test run.
 *
 * Safety rules enforced here, before anything runs:
 *   - The suite only uses a LOCAL database whose name contains "test". It refuses to
 *     start for any other host or name (never a production or real development database).
 *   - Test sign-in is switched on only for the test server this suite starts.
 *   - The AI is the scripted stand-in: no real AI quota is used.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = `http://localhost:${E2E_PORT}`;

/** Port of the local HTTPS push stub (see push-stub.ts). */
export const PUSH_STUB_PORT = Number(process.env.E2E_PUSH_PORT ?? 3443);
export const PUSH_STUB_ORIGIN = `https://localhost:${PUSH_STUB_PORT}`;

/** Secret the scheduler would send to the tick endpoint. Test-only value. */
export const TICK_SECRET = "flowzone-e2e-tick-secret-0123456789abcdef";

/** Directory for generated, git-ignored test files (certificate, stub state). */
export const TMP_DIR = path.resolve(__dirname, "..", ".tmp");

/**
 * Returns the test database URL, or throws a clear message. The name must contain
 * "test" and the host must be this machine, so a development or production database
 * can never be wiped or filled by mistake.
 */
export function testDatabaseUrl(): string {
  const raw = process.env.E2E_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      [
        "E2E_DATABASE_URL is not set.",
        "The Playwright suite needs its own local test database, for example:",
        '  E2E_DATABASE_URL="postgresql://flowzone:<password>@localhost:54400/flowzone_test"',
        "See docs/setup.md, section 'Running the tests'.",
      ].join("\n"),
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid URL. Nothing was changed.");
  }
  const localHost = ["localhost", "127.0.0.1"].includes(url.hostname);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!localHost || !/test/i.test(dbName)) {
    throw new Error(
      [
        "Refusing to run the tests against this database.",
        "E2E_DATABASE_URL must point at localhost and its database name must contain 'test'",
        "(for example flowzone_test). The tests create and delete users.",
      ].join("\n"),
    );
  }
  return raw;
}

let vapid: { publicKey: string; privateKey: string } | null = null;

/** One VAPID key pair per test run (test-only; never reused outside the suite). */
function runVapidKeys() {
  vapid ??= webpush.generateVAPIDKeys();
  return vapid;
}

/**
 * Environment for the test server (`next start`). Values here override anything in
 * the owner's .env.local, so the server always runs in test mode, with the stand-in AI.
 */
export function testServerEnv(extra: Record<string, string> = {}): Record<string, string> {
  const databaseUrl = testDatabaseUrl();
  const env: Record<string, string> = {
    APP_ENV: "test",
    ENABLE_TEST_LOGIN: "true",
    AI_PROVIDER: "standin",
    AI_API_KEY: "",
    AI_MODEL: "",
    NUDGE_TEST_CLOCK: "true",
    NUDGE_TICK_SECRET: TICK_SECRET,
    BETTER_AUTH_SECRET: "flowzone-e2e-auth-secret-0123456789abcdefghij",
    BETTER_AUTH_URL: BASE_URL,
    GOOGLE_CLIENT_ID: "e2e-placeholder-client-id",
    GOOGLE_CLIENT_SECRET: "e2e-placeholder-client-secret",
    ALLOWED_EMAILS: "e2e-owner@test.flowzone.invalid",
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
    // Web push is set up with keys made for this run, so nudges reach the local stub.
    VAPID_PUBLIC_KEY: runVapidKeys().publicKey,
    VAPID_PRIVATE_KEY: runVapidKeys().privateKey,
    VAPID_SUBJECT: "mailto:e2e-test@test.flowzone.invalid",
    ...extra,
  };
  return env;
}

/**
 * Makes (once) a self-signed certificate for the push stub, using the openssl that
 * ships with Git for Windows, macOS and Linux. The test server trusts it through
 * NODE_EXTRA_CA_CERTS, so pushes can be checked end to end.
 */
export function ensureTestCertificate(): { certPath: string; keyPath: string } {
  mkdirSync(TMP_DIR, { recursive: true });
  const certPath = path.join(TMP_DIR, "push-stub-cert.pem");
  const keyPath = path.join(TMP_DIR, "push-stub-key.pem");
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    try {
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          keyPath,
          "-out",
          certPath,
          "-days",
          "2",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1",
        ],
        { stdio: "pipe" },
      );
    } catch {
      throw new Error(
        "openssl was not found. It is needed to make the push test certificate (Git for Windows includes it). See docs/setup.md.",
      );
    }
  }
  return { certPath, keyPath };
}
