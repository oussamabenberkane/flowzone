import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env / .env.local the same way Next.js does, so `npm run db:*` just works.
loadEnvConfig(process.cwd());

// Migrations need a real (direct) connection. Prefer the unpooled string.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
