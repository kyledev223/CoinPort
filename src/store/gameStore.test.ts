import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISTRICTS, truckIdForMint, type Coin, type CoinChangeListener, type CoinSource } from "@/game";
import { useGameStore, WORLD_TICK_MS } from "./gameStore";

function coin(mint: string, overrides: Partial<Coin> = {}): Coin {
  return {
    mint,
    name: mint,
    symbol: mint.toUpperCase().slice(0, 6),
    imageUrl: "",
    metadataUri: "",
    creatorWallet: "W",
    createdAt: Date.now() - 3_600_000,
    network: "devnet",
    marketCapSol: 40,
    curveProgress: 0.2,
    graduated: false,
    ...overrides,
  };
}

/** In-memory CoinSource for tests: a fixed snapshot plus coins pushed by hand. */
class TestSource implements CoinSource {
  private readonly listeners = new Set<CoinChangeListener>();
  constructor(private readonly coins: Coin[]) {}
  async listCoins() {
    return this.coins.map((c) => ({ ...c }));
  }
  subscribe(onChange: CoinChangeListener) {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  }
  push(c: Coin) {
    this.coins.push(c);
    for (const l of this.listeners) l([{ ...c }]);
  }
}

describe("game store", () => {
  let disconnect: () => void;
  let source: TestSource;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    source = new TestSource([coin("a"), coin("b"), coin("c")]);
    disconnect = useGameStore.getState().connect(source);
    await vi.advanceTimersByTimeAsync(0); // snapshot loads, first step runs
  });

  afterEach(() => {
    disconnect();
    vi.useRealTimers();
  });

  it("loads the source's coins as trucks", () => {
    const s = useGameStore.getState();
    expect(s.status).toBe("live");
    expect(s.world.trucks).toHaveLength(3);
  });

  it("focuses a just-launched coin's truck as soon as it exists", async () => {
    const launched = coin("fresh", { createdAt: Date.now() });
    source.push(launched);
    useGameStore.getState().focusMint(launched.mint);
    expect(useGameStore.getState().pendingFocusMint).toBe(launched.mint);

    await vi.advanceTimersByTimeAsync(WORLD_TICK_MS);
    const s = useGameStore.getState();
    const id = truckIdForMint(launched.mint);
    expect(s.pendingFocusMint).toBeNull();
    expect(s.selection).toEqual({ kind: "truck", id });
    expect(s.followTruckId).toBe(id);
    expect(s.cameraRequest).not.toBeNull();
  });

  it("replaces the previous source on connect, so feeds never mix", async () => {
    const other = new TestSource([coin("other")]);
    const disconnectOther = useGameStore.getState().connect(other);
    await vi.advanceTimersByTimeAsync(0);
    // The first source keeps pushing, but it was disconnected.
    source.push(coin("late"));
    await vi.advanceTimersByTimeAsync(WORLD_TICK_MS);
    expect(Object.keys(useGameStore.getState().coins)).toEqual(["other"]);
    disconnectOther();
  });

  it("flies to districts and lets a pan take over", () => {
    const { goToDistrict } = useGameStore.getState();
    goToDistrict("graduation-gate");
    const grad = DISTRICTS.find((d) => d.id === "graduation-gate")!;
    expect(useGameStore.getState()).toMatchObject({
      district: "graduation-gate",
      cameraRequest: { x: grad.x, z: grad.z, distance: grad.distance },
    });
    useGameStore.getState().userPanned();
    expect(useGameStore.getState().district).toBeNull();
  });
});
