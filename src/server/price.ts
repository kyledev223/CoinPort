import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { meta } from "./db/schema";
import { env } from "./env";

/**
 * SOL/USD: CoinGecko first, then Coinbase, then Kraken (keyless CoinGecko
 * often rate-limits cloud hosts). The latest figure is stored; USD values are
 * computed from it at read time, so pages never wait on a price fetch.
 */

const KEY = "sol_usd";

export interface SolPrice {
  usd: number;
  source: string;
  at: number;
}

type Source = { name: string; fetch: () => Promise<number> };

const getJson = async (url: string, headers: Record<string, string> = {}) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return res.json() as Promise<unknown>;
};

const valid = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) throw new Error("no price in response");
  return v;
};

export const PRICE_SOURCES: Source[] = [
  {
    name: "coingecko",
    fetch: async () => {
      const key = env.coingeckoApiKey;
      const json = (await getJson("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", key ? { "x-cg-demo-api-key": key } : {})) as {
        solana?: { usd?: unknown };
      };
      return valid(json.solana?.usd);
    },
  },
  {
    name: "coinbase",
    fetch: async () => valid(((await getJson("https://api.coinbase.com/v2/prices/SOL-USD/spot")) as { data?: { amount?: unknown } }).data?.amount),
  },
  {
    name: "kraken",
    fetch: async () => {
      const json = (await getJson("https://api.kraken.com/0/public/Ticker?pair=SOLUSD")) as { result?: Record<string, { c?: unknown[] }> };
      const first = json.result ? Object.values(json.result)[0] : undefined;
      return valid(first?.c?.[0]);
    },
  },
];

export async function fetchSolUsd(sources: Source[] = PRICE_SOURCES): Promise<{ usd: number; source: string }> {
  const errors: string[] = [];
  for (const s of sources) {
    try {
      return { usd: await s.fetch(), source: s.name };
    } catch (err) {
      errors.push(`${s.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new Error(`no SOL price (${errors.join("; ")})`);
}

export async function storedSolPrice(db: Db): Promise<SolPrice | null> {
  const [row] = await db.select().from(meta).where(eq(meta.key, KEY)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as SolPrice;
  } catch {
    return null;
  }
}

export async function refreshSolPrice(db: Db): Promise<SolPrice> {
  const { usd, source } = await fetchSolUsd();
  const price: SolPrice = { usd, source, at: Date.now() };
  await db
    .insert(meta)
    .values({ key: KEY, value: JSON.stringify(price), updatedAt: new Date() })
    .onConflictDoUpdate({ target: meta.key, set: { value: JSON.stringify(price), updatedAt: new Date() } });
  return price;
}
