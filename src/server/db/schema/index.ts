/**
 * Every table in the database, in one place (drizzle-kit reads this file to build
 * migrations).
 *
 * To add a table of user data, create `./your-table.ts` with `userOwnedTable()`
 * (see ../user-owned-table.ts and docs/contracts/foundation.md), export it below,
 * then run `npm run db:generate` and commit the new SQL file in /drizzle.
 *
 * Use relative imports only: drizzle-kit loads these files in plain Node.
 */
export * from "./auth";
export * from "./projects";
export * from "./tasks";
export * from "./recurrence-records";
export * from "./entries";
export * from "./day-plans";
export * from "./settings";
