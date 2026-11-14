import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * DATA-ACCESS BOUNDARIES (the lint half of the "user data is always scoped" rule).
 * Explained in docs/contracts/foundation.md. If one of these rules blocks you, do not
 * disable it: use `forUser()` from "@/server/db/scoped" instead.
 */
const RAW_DB_MESSAGE =
  'The raw database client is restricted. Read and write user data through forUser() from "@/server/db/scoped".';

const restrictedImports = {
  patterns: [
    { group: ["@/server/db/raw", "**/db/raw"], message: RAW_DB_MESSAGE },
    {
      group: ["pg", "pg/*", "drizzle-orm/node-postgres", "drizzle-orm/node-postgres/*"],
      message: "Database drivers are only created in src/server/db/raw.ts. " + RAW_DB_MESSAGE,
    },
  ],
  paths: [
    {
      name: "@/server/auth/user-context",
      importNames: ["mintUserContext"],
      message:
        "mintUserContext is internal. Get a UserContext from requireUser(), requirePageUser() or system-context.ts.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,

  // Everywhere: no raw database access, no forging user contexts.
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    rules: { "no-restricted-imports": ["error", restrictedImports] },
  },

  // The only places allowed to use the raw client / mint contexts.
  {
    files: [
      "src/server/db/**",
      "src/server/auth/**",
      "src/app/api/health/**",
      "scripts/**",
      "drizzle.config.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },

  // UI and shared code must never reach into server-only code.
  {
    files: ["src/ui/**", "src/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/*", "**/server/*", "server-only"],
              message: "UI and shared code run in the browser and must not import server code.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / not application code:
    "drizzle/**",
    "agents/**",
    "assets/**",
  ]),
]);

export default eslintConfig;
