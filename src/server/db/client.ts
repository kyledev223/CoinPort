import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { AppError } from "../errors";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { coinportDb?: Promise<Db>; coinportDbOverride?: Db };

/** Tests (and only tests) swap in an in-memory database. */
export function setDbForTests(db: Db | null) {
  globalForDb.coinportDbOverride = db ?? undefined;
}

export function databaseConfigured(): boolean {
  return Boolean(globalForDb.coinportDbOverride || env.databaseUrl);
}

/** The shared database handle (one pool per server instance, reused across hot reloads). */
export function getDb(): Promise<Db> {
  if (globalForDb.coinportDbOverride) return Promise.resolve(globalForDb.coinportDbOverride);
  const url = env.databaseUrl;
  if (!url) {
    throw new AppError("not-configured", "Launching isn't set up yet: the site's database is not configured.");
  }
  globalForDb.coinportDb ??= (url.startsWith("pglite:") ? openPglite(url.slice("pglite:".length)) : openPostgres(url)).catch((err) => {
    // Don't cache a failed open: the next request tries again.
    globalForDb.coinportDb = undefined;
    throw err;
  });
  return globalForDb.coinportDb;
}

async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  // Serverless: a small pool per instance; Neon's pooled URL does the rest.
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  return drizzle(pool, { schema }) as unknown as Db;
}

/** Local development without Postgres: an embedded database in a folder, migrated on open. */
async function openPglite(dir: string): Promise<Db> {
  const { mkdirSync } = await import("node:fs");
  const folder = dir || "./.data/pglite";
  mkdirSync(folder, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(folder), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}
