import type { Coin, CoinChangeListener, CoinSource, Unsubscribe } from "@/game";

/** One coin from GET /api/coins (a Coin plus when it last changed). */
type CoinDto = Coin & { updatedAt: number };

/**
 * The live coin feed: coins launched through CoinPort and finalized in the
 * database, with market data the server refreshes from the bonding curve.
 * Polls GET /api/coins and pushes coins that are new or changed.
 */
export class ApiCoinSource implements CoinSource {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly url = "/api/coins",
    private readonly pollMs = 4_000,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async listCoins(): Promise<Coin[]> {
    const coins = await this.fetchCoins();
    for (const c of coins) this.seen.set(c.mint, c.updatedAt);
    return coins.map(toCoin);
  }

  subscribe(onChange: CoinChangeListener): Unsubscribe {
    let stopped = false;
    const poll = async () => {
      try {
        const coins = await this.fetchCoins();
        const changed = coins.filter((c) => this.seen.get(c.mint) !== c.updatedAt);
        for (const c of changed) this.seen.set(c.mint, c.updatedAt);
        if (!stopped && changed.length > 0) onChange(changed.map(toCoin));
      } catch {
        // Keep the last known coins and try again on the next poll.
      }
    };
    const timer = setInterval(poll, this.pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  private async fetchCoins(): Promise<CoinDto[]> {
    const res = await this.fetchImpl(this.url, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { coins?: CoinDto[]; error?: { message?: string } } | null;
    if (!res.ok || !json?.coins) throw new Error(json?.error?.message ?? `Coin feed unavailable (${res.status}).`);
    return json.coins;
  }
}

function toCoin(c: CoinDto): Coin {
  return {
    mint: c.mint,
    name: c.name,
    symbol: c.symbol,
    imageUrl: c.imageUrl,
    metadataUri: c.metadataUri,
    creatorWallet: c.creatorWallet,
    createdAt: c.createdAt,
    marketCapSol: c.marketCapSol,
    ...(c.marketCapUsd !== undefined ? { marketCapUsd: c.marketCapUsd } : {}),
    curveProgress: c.curveProgress,
    graduated: c.graduated,
  };
}
