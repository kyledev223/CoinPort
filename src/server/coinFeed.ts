import "server-only";
import { desc, gt, isNull, or } from "drizzle-orm";
import { getDb } from "./db/client";
import { coins } from "./db/schema";
import { storedSolPrice } from "./price";

/** One coin as the game's ApiCoinSource receives it. */
export interface CoinDto {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  metadataUri: string;
  creatorWallet: string;
  createdAt: number;
  marketCapSol: number;
  marketCapUsd?: number;
  curveProgress: number;
  graduated: boolean;
  /** Last change, so the client can tell what's new. */
  updatedAt: number;
}

/** How many coins the game shows (newest first). */
export const FEED_LIMIT = 500;
/** Graduated coins stay in the feed this long, so their truck can drive out through the Graduation Gate once. */
export const GRADUATED_VISIBLE_MS = 10 * 60_000;

/** Finalized coins with market data; USD comes from the latest stored SOL price, at read time. */
export async function coinFeed(): Promise<{ coins: CoinDto[]; solUsd: number | null }> {
  const db = await getDb();
  const [rows, price] = await Promise.all([db
      .select()
      .from(coins)
      .where(or(isNull(coins.graduatedAt), gt(coins.graduatedAt, new Date(Date.now() - GRADUATED_VISIBLE_MS))))
      .orderBy(desc(coins.createdAt))
      .limit(FEED_LIMIT), storedSolPrice(db)]);
  const solUsd = price?.usd ?? null;
  return {
    solUsd,
    coins: rows.map((r) => ({
      mint: r.mint,
      name: r.name,
      symbol: r.symbol,
      imageUrl: r.imageUrl,
      metadataUri: r.metadataUri,
      creatorWallet: r.creator,
      createdAt: r.createdAt.getTime(),
      marketCapSol: r.marketCapSol,
      ...(solUsd ? { marketCapUsd: r.marketCapSol * solUsd } : {}),
      curveProgress: r.curveProgress,
      graduated: r.graduated,
      updatedAt: r.updatedAt.getTime(),
    })),
  };
}
