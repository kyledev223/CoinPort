import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISTRICTS, MockCoinSource, truckIdForMint } from "@/game";
import { useGameStore, WORLD_TICK_MS } from "./gameStore";

describe("game store", () => {
  let disconnect: () => void;
  let source: MockCoinSource;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    source = new MockCoinSource({ tickMs: 0, launchChance: 0 });
    disconnect = useGameStore.getState().connect(source);
    await vi.advanceTimersByTimeAsync(0); // snapshot loads, first step runs
  });

  afterEach(() => {
    disconnect();
    vi.useRealTimers();
  });

  it("loads the source and reports it as simulated", () => {
    const s = useGameStore.getState();
    expect(s.status).toBe("live");
    expect(s.isSimulated).toBe(true);
    expect(s.world.trucks).toHaveLength(20);
  });

  it("focuses a just-launched coin's truck as soon as it exists", async () => {
    const coin = source.launchCoin({ name: "Test", symbol: "TEST" });
    useGameStore.getState().focusMint(coin.mint);
    expect(useGameStore.getState().pendingFocusMint).toBe(coin.mint);

    await vi.advanceTimersByTimeAsync(WORLD_TICK_MS);
    const s = useGameStore.getState();
    const id = truckIdForMint(coin.mint);
    expect(s.pendingFocusMint).toBeNull();
    expect(s.selection).toEqual({ kind: "truck", id });
    expect(s.followTruckId).toBe(id);
    expect(s.cameraRequest).not.toBeNull();
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
