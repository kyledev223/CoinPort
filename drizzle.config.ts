import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from src/server/db/schema.ts into ./drizzle.
// Run `npm run db:generate` after changing the schema; commit the output.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
