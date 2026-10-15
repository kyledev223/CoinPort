import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Wallet sign-in sessions. Only a SHA-256 hash of the cookie token is stored. */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  wallet: text("wallet").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** One-time sign-in nonces. */
export const nonces = pgTable("nonces", {
  nonce: text("nonce").primaryKey(),
  wallet: text("wallet").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/**
 * A launch from prepare to finalize.
 * Status: prepared → built → sent → confirmed, or failed / expired (with `error`).
 */
export const launches = pgTable(
  "launches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wallet: text("wallet").notNull(),
    ipHash: text("ip_hash").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    description: text("description").notNull().default(""),
    twitter: text("twitter"),
    telegram: text("telegram"),
    website: text("website"),
    imageUrl: text("image_url"),
    metadataUri: text("metadata_uri").notNull(),
    mint: text("mint").unique(),
    signature: text("signature"),
    status: text("status").notNull().default("prepared"),
    error: text("error"),
    lastValidBlockHeight: bigint("last_valid_block_height", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (t) => [index("launches_status_idx").on(t.status), index("launches_wallet_idx").on(t.wallet)],
);

/** Finalized coins: what the game shows. Market data is refreshed from the bonding curve. */
export const coins = pgTable(
  "coins",
  {
    mint: text("mint").primaryKey(),
    launchId: uuid("launch_id")
      .notNull()
      .unique()
      .references(() => launches.id),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    imageUrl: text("image_url").notNull().default(""),
    metadataUri: text("metadata_uri").notNull(),
    creator: text("creator").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    marketCapSol: doublePrecision("market_cap_sol").notNull().default(0),
    curveProgress: doublePrecision("curve_progress").notNull().default(0),
    complete: boolean("complete").notNull().default(false),
    graduated: boolean("graduated").notNull().default(false),
    /** When we first saw the curve migrated; the feed drops coins a while after this. */
    graduatedAt: timestamp("graduated_at", { withTimezone: true }),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coins_created_idx").on(t.createdAt)],
);

/** Fixed-window request counters for rate limiting. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** Background job locks and run records (one row per job). */
export const jobs = pgTable("jobs", {
  name: text("name").primaryKey(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull().default(sql`'epoch'`),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastError: text("last_error"),
});

/** Small key/value store (e.g. the latest SOL/USD price). */
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
