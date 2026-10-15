import type { CoinChangeListener, CoinSource, Unsubscribe } from "../coinSource";
import { isCurveComplete } from "../rules";
import type { Coin, Network } from "../types";
import { LAUNCH_POOL, createSeedCoins, makeMockCoin, marketCapSolAtProgress, MOCK_SOL_USD, mulberry32 } from "./seed";

export interface MockCoinSourceOptions {
  /** PRNG seed for the seed coins and the simulation. */
  seed?: number;
  /** Clock; defaults to Date.now. */
  now?: () => number;
  /** Simulation tick interval while anyone is subscribed. 0 disables the timer (drive it with `tick()`). */
  tickMs?: number;
  /** Chance per tick that a new coin launches. */
  launchChance?: number;
  /** Ticks between a curve completing and the coin graduating. */
  graduateAfterTicks?: number;
  /** Network stamped on every mock coin, so explorer links match the app's network. */
  network?: Network;
}

/**
 * Fake pump.fun feed: starts from the 20 seed coins, then every 2 s nudges
 * curve progress and market caps, graduates completed curves, and now and
 * then launches a new coin. Deterministic for a given seed and clock.
 */
export class MockCoinSource implements CoinSource {
  readonly isSimulated = true;

  private readonly coins = new Map<string, Coin>();
  private readonly listeners = new Set<CoinChangeListener>();
  private readonly completedAtTick = new Map<string, number>();
  private readonly rand: () => number;
  private readonly now: () => number;
  private readonly tickMs: number;
  private readonly launchChance: number;
  private readonly graduateAfterTicks: number;
  private readonly network: Network;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private launches = 0;

  constructor(options: MockCoinSourceOptions = {}) {
    const seed = options.seed ?? 0xc01d;
    this.now = options.now ?? Date.now;
    this.tickMs = options.tickMs ?? 2000;
    this.launchChance = options.launchChance ?? 0.2;
    this.graduateAfterTicks = options.graduateAfterTicks ?? 4;
    this.network = options.network ?? "devnet";
    this.rand = mulberry32(seed + 1);
    for (const coin of createSeedCoins(this.now(), seed, this.network)) {
      this.coins.set(coin.mint, coin);
      if (isCurveComplete(coin) && !coin.graduated) this.completedAtTick.set(coin.mint, 0);
    }
  }

  async listCoins(): Promise<Coin[]> {
    return [...this.coins.values()].map((c) => ({ ...c }));
  }

  subscribe(onChange: CoinChangeListener): Unsubscribe {
    this.listeners.add(onChange);
    if (!this.timer && this.tickMs > 0) this.timer = setInterval(() => this.tick(), this.tickMs);
    return () => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Advance the simulation one step and notify subscribers. Returns the changed coins. */
  tick(): Coin[] {
    this.ticks++;
    const changed: Coin[] = [];

    for (const coin of this.coins.values()) {
      const next = this.evolve(coin);
      if (next !== coin) {
        this.coins.set(next.mint, next);
        changed.push(next);
      }
    }

    if (this.rand() < this.launchChance) {
      const coin = this.launch();
      this.coins.set(coin.mint, coin);
      changed.push(coin);
    }

    this.emit(changed);
    return changed;
  }

  /**
   * Add a coin as if someone just launched it, and push it to subscribers.
   * Lets the launch dialog's stub show a truck arriving; not part of CoinSource.
   */
  launchCoin(fields: { name: string; symbol: string; imageUrl?: string }): Coin {
    const coin = makeMockCoin(this.rand, { ...fields, createdAt: this.now(), curveProgress: 0, network: this.network });
    this.coins.set(coin.mint, coin);
    this.emit([coin]);
    return { ...coin };
  }

  private emit(changed: readonly Coin[]) {
    if (changed.length === 0) return;
    const snapshot = changed.map((c) => ({ ...c }));
    for (const listener of this.listeners) listener(snapshot);
  }

  private evolve(coin: Coin): Coin {
    if (coin.graduated) {
      if (this.rand() > 0.3) return coin;
      return this.withMarketCap(coin, coin.marketCapSol * (1 + (this.rand() - 0.48) * 0.06));
    }

    const completedAt = this.completedAtTick.get(coin.mint);
    if (completedAt !== undefined) {
      if (this.ticks - completedAt < this.graduateAfterTicks) return coin;
      this.completedAtTick.delete(coin.mint);
      return { ...coin, graduated: true };
    }

    if (this.rand() > 0.4) return coin;
    // Slight upward drift so some coins eventually complete.
    let curveProgress = Math.min(1, Math.max(0, coin.curveProgress + (this.rand() - 0.42) * 0.08));
    if (curveProgress > 0.995) {
      curveProgress = 1;
      this.completedAtTick.set(coin.mint, this.ticks);
    }
    return { ...this.withMarketCap(coin, marketCapSolAtProgress(curveProgress)), curveProgress };
  }

  private withMarketCap(coin: Coin, marketCapSol: number): Coin {
    return {
      ...coin,
      marketCapSol,
      ...(coin.marketCapUsd === undefined ? {} : { marketCapUsd: marketCapSol * MOCK_SOL_USD }),
    };
  }

  private launch(): Coin {
    const { symbol, name } = LAUNCH_POOL[this.launches % LAUNCH_POOL.length];
    const round = Math.floor(this.launches / LAUNCH_POOL.length);
    this.launches++;
    return makeMockCoin(this.rand, {
      symbol,
      name: round === 0 ? name : `${name} ${round + 1}`,
      createdAt: this.now(),
      curveProgress: 0,
      network: this.network,
    });
  }
}
