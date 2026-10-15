// Applies the SQL migrations in ./drizzle to DATABASE_URL. Runs during the
// Vercel build (npm run vercel-build) and can be run by hand: npm run db:migrate.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.warn("[migrate] DATABASE_URL is not set: skipping migrations. Launching stays off until a database is configured.");
  process.exit(0);
}
if (url.startsWith("pglite:")) {
  console.log("[migrate] Local embedded database: migrations run when the app opens it.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Database is up to date.");
} catch (err) {
  console.error("[migrate] Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
