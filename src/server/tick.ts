import "server-only";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { readCurves } from "./chain";
import { getDb, type Db } from "./db/client";
import { coins, jobs, launches, nonces, rateLimits, sessions } from "./db/schema";
import { finalizePending } from "./launch/service";
import { refreshSolPrice, storedSolPrice } from "./price";

/**
 * Background work for a serverless host (no long-running worker). Runs under
 * a database lock so concurrent triggers don't overlap, and each part only
 * does work when its data is stale. Triggered by /api/cron, by after() on the
 * coin feed, and by launch status polls.
 */

const JOB = "tick";
const LOCK_MS = 55_000;
const COIN_REFRESH_MS = 15_000;
const PRICE_REFRESH_MS = 60_000;
/** A launch nobody approved within this time is marked expired. */
const ABANDONED_MS = 2 * 60 * 60_000;

/** Atomically takes the job lock; false if another run holds it. */
export async function acquireLock(db: Db, name: string, ms: number): Promise<boolean> {
  await db.insert(jobs).values({ name }).onConflictDoNothing();
  const now = new Date();
  const taken = await db
    .update(jobs)
    .set({ lockedUntil: new Date(now.getTime() + ms), lastRunAt: now })
    .where(and(eq(jobs.name, name), lt(jobs.lockedUntil, now)))
    .returning({ name: jobs.name });
  return taken.length > 0;
}

async function release(db: Db, name: string, error: string | null) {
  await db
    .update(jobs)
    .set({ lockedUntil: new Date(), lastError: error, ...(error ? {} : { lastOkAt: new Date() }) })
    .where(eq(jobs.name, name));
}

async function refreshCoins(db: Db): Promise<number> {
  const stale = await db
    .select({ mint: coins.mint, marketCapSol: coins.marketCapSol, graduatedAt: coins.graduatedAt })
    .from(coins)
    .where(and(eq(coins.graduated, false), or(isNull(coins.refreshedAt), lt(coins.refreshedAt, new Date(Date.now() - COIN_REFRESH_MS)))))
    .orderBy(asc(coins.refreshedAt))
    .limit(500);
  if (stale.length === 0) return 0;
  const curves = await readCurves(stale.map((c) => c.mint));
  for (const c of stale) {
    const curve = curves.get(c.mint);
    if (!curve) continue;
    await db
      .update(coins)
      .set({
        // A migrated curve's reserves are zeroed: keep the last market cap we saw.
        marketCapSol: curve.graduated ? c.marketCapSol : curve.stats.marketCapSol,
        curveProgress: curve.graduated ? 1 : curve.stats.curveProgress,
        complete: curve.stats.complete || curve.graduated,
        graduated: curve.graduated,
        graduatedAt: curve.graduated ? (c.graduatedAt ?? new Date()) : null,
        refreshedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coins.mint, c.mint));
  }
  return stale.length;
}

export interface TickReport {
  ran: boolean;
  finalized?: number;
  expired?: number;
  refreshed?: number;
  price?: number | null;
  error?: string;
}

export async function runTick(): Promise<TickReport> {
  const db = await getDb();
  if (!(await acquireLock(db, JOB, LOCK_MS))) return { ran: false };
  try {
    const finalized = await finalizePending();
    const expired = await db
      .update(launches)
      .set({ status: "expired", error: "This launch was never approved in the wallet.", updatedAt: new Date() })
      .where(and(inArray(launches.status, ["prepared", "built"]), lt(launches.updatedAt, new Date(Date.now() - ABANDONED_MS))))
      .returning({ id: launches.id });
    const refreshed = await refreshCoins(db).catch((err) => {
      console.warn("[coinport] coin refresh failed:", err instanceof Error ? err.message : err);
      return 0;
    });

    const stored = await storedSolPrice(db);
    let price = stored?.usd ?? null;
    if (Date.now() - (stored?.at ?? 0) > PRICE_REFRESH_MS) {
      price = await refreshSolPrice(db)
        .then((p) => p.usd)
        .catch((err) => {
          console.warn("[coinport] SOL price refresh failed:", err instanceof Error ? err.message : err);
          return price;
        });
    }

    // Housekeeping.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, dayAgo));
    await db.delete(nonces).where(lt(nonces.expiresAt, new Date()));
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

    await release(db, JOB, null);
    return { ran: true, finalized, expired: expired.length, refreshed, price };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await release(db, JOB, message.slice(0, 500));
    return { ran: true, error: message };
  }
}

/** Per-instance throttle for after() triggers on busy endpoints. */
let lastTriggered = 0;
export function tickSoon(minIntervalMs = 10_000): Promise<unknown> | undefined {
  if (Date.now() - lastTriggered < minIntervalMs) return undefined;
  lastTriggered = Date.now();
  return runTick().catch((err) => console.warn("[coinport] tick failed:", err instanceof Error ? err.message : err));
}

export async function jobStatus(db: Db) {
  const [row] = await db.select().from(jobs).where(eq(jobs.name, JOB)).limit(1);
  return row ?? null;
}

