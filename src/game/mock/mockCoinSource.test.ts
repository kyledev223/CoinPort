import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { advanceTrucks } from "../rules";
import { MockCoinSource } from "./mockCoinSource";
import { LAUNCH_POOL, createSeedForklifts, marketCapSolAtProgress, mockLogoUrl } from "./seed";

const NOW = 1_800_000_000_000;

describe("MockCoinSource", () => {
  it("seeds 20 simulated coins, 2 graduated, with local logos", async () => {
    const source = new MockCoinSource({ now: () => NOW, tickMs: 0 });
    const coins = await source.listCoins();
    expect(source.isSimulated).toBe(true);
    expect(coins).toHaveLength(20);
    expect(coins.filter((c) => c.graduated)).toHaveLength(2);
    expect(new Set(coins.map((c) => c.mint)).size).toBe(20);
    for (const c of coins) {
      expect(c.imageUrl.startsWith("/mock-coins/")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", c.imageUrl))).toBe(true);
    }
    for (const { symbol } of LAUNCH_POOL) {
      expect(existsSync(join(process.cwd(), "public", mockLogoUrl(symbol)))).toBe(true);
    }
  });

  it("spreads the seed across the lifecycle and storage tiers", async () => {
    const coins = await new MockCoinSource({ now: () => NOW, tickMs: 0 }).listCoins();
    const { trucks } = advanceTrucks(coins, [], NOW);
    const states = new Set(trucks.map((t) => t.state));
    const zones = new Set(trucks.map((t) => t.zoneId));
    for (const s of ["arriving", "docking", "stored", "hauling", "graduated"] as const) expect(states).toContain(s);
    for (const z of ["entry-gate", "launch-bay", "storage-a", "storage-b", "storage-c", "graduation-gate"] as const) {
      expect(zones).toContain(z);
    }
  });

  it("is deterministic and pushes changes to subscribers on tick", async () => {
    const a = new MockCoinSource({ now: () => NOW, tickMs: 0, seed: 7, launchChance: 1 });
    const b = new MockCoinSource({ now: () => NOW, tickMs: 0, seed: 7, launchChance: 1 });
    expect(await a.listCoins()).toEqual(await b.listCoins());

    const received: string[] = [];
    const unsubscribe = a.subscribe((changed) => received.push(...changed.map((c) => c.mint)));
    for (let i = 0; i < 5; i++) a.tick();
    unsubscribe();
    expect(received.length).toBeGreaterThan(0);
    expect((await a.listCoins()).length).toBe(25); // launchChance 1: one launch per tick
  });

  it("stamps the configured network and accepts manual launches", async () => {
    const source = new MockCoinSource({ now: () => NOW, tickMs: 0, network: "mainnet-beta" });
    const pushed: string[] = [];
    source.subscribe((changed) => pushed.push(...changed.map((c) => c.mint)));
    const coin = source.launchCoin({ name: "Test Launch", symbol: "TEST", imageUrl: "blob:local" });
    expect(coin).toMatchObject({ symbol: "TEST", imageUrl: "blob:local", network: "mainnet-beta", createdAt: NOW, curveProgress: 0 });
    expect(pushed).toEqual([coin.mint]);
    expect((await source.listCoins()).every((c) => c.network === "mainnet-beta")).toBe(true);
  });

  it("models the pump.fun curve end points", () => {
    expect(marketCapSolAtProgress(0)).toBeCloseTo(27.96, 1);
    expect(marketCapSolAtProgress(1)).toBeCloseTo(410.9, 0);
  });

  it("has six forklifts, four of them Launch Bay crew", () => {
    const forklifts = createSeedForklifts();
    expect(forklifts).toHaveLength(6);
    expect(forklifts.filter((f) => f.zoneId === "launch-bay")).toHaveLength(4);
  });
});
