/**
 * Runs once before the suite: starts the local push stub. Its returned function runs once
 * after the suite: it stops the stub and removes every test account (their rows follow by
 * cascade), so a run leaves nothing behind in the test database.
 */
import { Client } from "pg";
import { startPushStub } from "./push-stub";
import { PUSH_LOG } from "./push-stub";
import { testDatabaseUrl } from "./env";
import { rmSync } from "node:fs";

export default async function globalSetup() {
  const stub = await startPushStub();

  return async () => {
    await stub.close();
    rmSync(PUSH_LOG, { force: true });

    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      const result = await client.query(
        `DELETE FROM "user" WHERE email LIKE '%@test.flowzone.invalid'`,
      );
      console.log(`[e2e] removed ${result.rowCount ?? 0} test account(s)`);
    } finally {
      await client.end();
    }
  };
}
