import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { rateLimits } from "./db/schema";
import { AppError } from "./errors";

/**
 * Fixed-window rate limits, counted in the database so they hold across
 * serverless instances. Tune the numbers here.
 */
export const LIMITS = {
  /** Launch prepares (each one uploads an image) per wallet. */
  prepareWallet: { limit: 5, windowMs: 10 * 60_000 },
  /** Launch prepares per IP address (hashed). */
  prepareIp: { limit: 10, windowMs: 10 * 60_000 },
  /** Sign-in nonces per IP address. */
  signInIp: { limit: 30, windowMs: 10 * 60_000 },
} as const;

export async function rateLimit(db: Db, key: string, rule: { limit: number; windowMs: number }, now = Date.now()): Promise<void> {
  const windowStart = new Date(Math.floor(now / rule.windowMs) * rule.windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  if ((row?.count ?? 0) > rule.limit) {
    const minutes = Math.ceil((windowStart.getTime() + rule.windowMs - now) / 60_000);
    throw new AppError("rate-limited", `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
}
