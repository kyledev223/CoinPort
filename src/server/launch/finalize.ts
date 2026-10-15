import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { coins, launches } from "../db/schema";
import type { CurveStats } from "../curve";

/** What finalize needs to know from the chain (production: ./chain.ts; tests: a fake). */
export interface ChainReader {
  /** null when the network has no record of the signature (yet). */
  signatureStatus(signature: string): Promise<{ confirmed: boolean; err: unknown | null } | null>;
  blockHeight(): Promise<number>;
  /** The coin's bonding curve, or null if the account doesn't exist (yet). */
  bondingCurve(mint: string): Promise<{ creator: string; stats: CurveStats; graduated: boolean } | null>;
}

export type LaunchRow = typeof launches.$inferSelect;

export const EXPIRED_MESSAGE = "Your approval expired before it reached the network. Nothing was charged. Please launch again.";

/** Moves a launch out of "sent" only if it is still "sent", so concurrent callers can't overwrite each other. */
async function markFromSent(db: Db, id: string, patch: Partial<LaunchRow>) {
  await db
    .update(launches)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(launches.id, id), eq(launches.status, "sent")));
}

async function load(db: Db, id: string): Promise<LaunchRow | undefined> {
  const [row] = await db.select().from(launches).where(eq(launches.id, id)).limit(1);
  return row;
}

/**
 * Finalizes a sent launch. Safe to call repeatedly and concurrently (from the
 * launching user's status polls, the cron tick and page loads):
 * - not on chain yet: stays "sent", or becomes "expired" once its blockhash can no longer land,
 * - failed on chain: "failed" with the reason,
 * - confirmed: checks the bonding curve exists and its creator is the wallet, then
 *   creates the coin inside a transaction that claims the launch row first.
 */
export async function finalizeLaunch(db: Db, id: string, chain: ChainReader): Promise<LaunchRow | undefined> {
  const row = await load(db, id);
  if (!row || row.status !== "sent" || !row.signature || !row.mint) return row;

  const status = await chain.signatureStatus(row.signature);
  if (!status) {
    if (row.lastValidBlockHeight != null && (await chain.blockHeight()) > row.lastValidBlockHeight) {
      await markFromSent(db, id, { status: "expired", error: EXPIRED_MESSAGE });
    }
    return load(db, id);
  }
  if (status.err) {
    await markFromSent(db, id, {
      status: "failed",
      error: `The network rejected the launch (${JSON.stringify(status.err)}). Only the network fee was charged.`,
    });
    return load(db, id);
  }
  if (!status.confirmed) return row;

  const curve = await chain.bondingCurve(row.mint);
  if (!curve) return row; // confirmed but the account isn't visible yet: try again next poll
  if (curve.creator !== row.wallet) {
    await markFromSent(db, id, { status: "failed", error: "The coin was created, but not by your wallet. Please contact support." });
    return load(db, id);
  }

  const mint = row.mint;
  await db.transaction(async (tx) => {
    // Claim the launch: whoever locks it while it's still "sent" creates the coin.
    const [locked] = await tx.select().from(launches).where(eq(launches.id, id)).for("update");
    if (!locked || locked.status !== "sent") return;
    await tx
      .insert(coins)
      .values({
        mint,
        launchId: id,
        name: locked.name,
        symbol: locked.symbol,
        imageUrl: locked.imageUrl ?? "",
        metadataUri: locked.metadataUri,
        creator: locked.wallet,
        marketCapSol: curve.stats.marketCapSol,
        curveProgress: curve.stats.curveProgress,
        complete: curve.stats.complete,
        graduated: curve.graduated,
        graduatedAt: curve.graduated ? new Date() : null,
        refreshedAt: new Date(),
      })
      .onConflictDoNothing();
    await tx.update(launches).set({ status: "confirmed", error: null, finalizedAt: new Date(), updatedAt: new Date() }).where(eq(launches.id, id));
  });
  return load(db, id);
}
