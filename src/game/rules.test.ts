import { describe, expect, it } from "vitest";
import {
  ARRIVE_MS,
  DOCK_COUNT,
  DOCK_MS,
  GRADUATION_DWELL_MS,
  INTAKE_MS,
  MIN_HAUL_MS,
  TIER_THRESHOLDS_SOL,
  UNLOAD_MS,
  YARD_MAX_WAIT_MS,
} from "./constants";
import { DOCKS, EXIT_POSITION, ZONES, inOverflowLot, zoneCapacity } from "./layout";
import {
  advanceTrucks,
  assignDocks,
  clampProgress,
  createTruck,
  initialTruckState,
  isCurveComplete,
  layoutTrucks,
  nextTransition,
  stepTruck,
  storageZoneForCoin,
  summarizeHub,
  tierForMarketCap,
  truckIdForMint,
  zoneForTruck,
} from "./rules";
import type { Coin, Truck } from "./types";

const NOW = 1_800_000_000_000;

function coin(overrides: Partial<Coin> = {}): Coin {
  return {
    mint: "MintAAAApump",
    name: "Test",
    symbol: "TST",
    imageUrl: "/mock-coins/tst.svg",
    metadataUri: "mock://metadata/MintAAAApump",
    creatorWallet: "Creator111",
    createdAt: NOW - 10 * 60_000,
    network: "devnet",
    marketCapSol: 30,
    marketCapUsd: 4800,
    curveProgress: 0.1,
    graduated: false,
    ...overrides,
  };
}

function truck(overrides: Partial<Truck> = {}): Truck {
  return {
    id: truckIdForMint("MintAAAApump"),
    mint: "MintAAAApump",
    state: "stored",
    zoneId: "storage-a",
    dockId: null,
    position: { x: 0, y: 0, z: 0 },
    stateChangedAt: NOW - 60_000,
    ...overrides,
  };
}

describe("tierForMarketCap", () => {
  it("splits at the tier thresholds", () => {
    expect(tierForMarketCap(0)).toBe(1);
    expect(tierForMarketCap(TIER_THRESHOLDS_SOL.growth - 0.01)).toBe(1);
    expect(tierForMarketCap(TIER_THRESHOLDS_SOL.growth)).toBe(2);
    expect(tierForMarketCap(TIER_THRESHOLDS_SOL.elite - 0.01)).toBe(2);
    expect(tierForMarketCap(TIER_THRESHOLDS_SOL.elite)).toBe(3);
    expect(tierForMarketCap(1_000_000)).toBe(3);
  });

  it("treats bad numbers as Tier 1", () => {
    expect(tierForMarketCap(Number.NaN)).toBe(1);
    expect(tierForMarketCap(-5)).toBe(1);
  });

  it("maps tiers to storage halls", () => {
    expect(storageZoneForCoin(coin({ marketCapSol: 10 }))).toBe("storage-a");
    expect(storageZoneForCoin(coin({ marketCapSol: 80 }))).toBe("storage-b");
    expect(storageZoneForCoin(coin({ marketCapSol: 300 }))).toBe("storage-c");
  });
});

describe("curve progress", () => {
  it("clamps to 0–1", () => {
    expect(clampProgress(-0.2)).toBe(0);
    expect(clampProgress(1.3)).toBe(1);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(0.4)).toBe(0.4);
  });

  it("is complete at 1 or when graduated", () => {
    expect(isCurveComplete(coin({ curveProgress: 0.999 }))).toBe(false);
    expect(isCurveComplete(coin({ curveProgress: 1 }))).toBe(true);
    expect(isCurveComplete(coin({ curveProgress: 0.5, graduated: true }))).toBe(true);
  });
});

describe("initialTruckState", () => {
  it("starts fresh launches arriving, backdated to launch", () => {
    const createdAt = NOW - 5_000;
    expect(initialTruckState(coin({ createdAt }), NOW)).toEqual({ state: "arriving", stateChangedAt: createdAt });
  });

  it("clamps a future createdAt to now", () => {
    expect(initialTruckState(coin({ createdAt: NOW + 60_000 }), NOW)).toEqual({
      state: "arriving",
      stateChangedAt: NOW,
    });
  });

  it("starts coins older than a full intake stored", () => {
    const createdAt = NOW - INTAKE_MS - 1;
    expect(initialTruckState(coin({ createdAt }), NOW)).toEqual({
      state: "stored",
      stateChangedAt: createdAt + INTAKE_MS,
    });
  });

  it("starts completed curves hauling and graduated coins at the gate", () => {
    expect(initialTruckState(coin({ curveProgress: 1 }), NOW).state).toBe("hauling");
    expect(initialTruckState(coin({ curveProgress: 1, graduated: true }), NOW).state).toBe("graduated");
  });
});

describe("nextTransition", () => {
  const t0 = NOW - 1_000_000;

  it("runs the intake timers", () => {
    const c = coin();
    expect(nextTransition({ state: "docking", stateChangedAt: NOW - DOCK_MS + 1 }, c, NOW)).toBeNull();
    expect(nextTransition({ state: "docking", stateChangedAt: t0 }, c, NOW)).toEqual({
      state: "unloading",
      at: t0 + DOCK_MS,
    });
    expect(nextTransition({ state: "unloading", stateChangedAt: t0 }, c, NOW)).toEqual({
      state: "stored",
      at: t0 + UNLOAD_MS,
    });
  });

  it("never docks on its own; a truck stuck in the yard too long goes to storage", () => {
    const c = coin();
    expect(nextTransition({ state: "arriving", stateChangedAt: NOW - ARRIVE_MS }, c, NOW)).toBeNull();
    expect(nextTransition({ state: "arriving", stateChangedAt: t0 }, c, NOW)).toEqual({
      state: "stored",
      at: t0 + ARRIVE_MS + YARD_MAX_WAIT_MS,
    });
  });

  it("sends any intake or stored truck hauling when the curve completes", () => {
    const c = coin({ curveProgress: 1 });
    for (const state of ["arriving", "docking", "unloading", "stored"] as const) {
      expect(nextTransition({ state, stateChangedAt: NOW - 100 }, c, NOW)).toEqual({ state: "hauling", at: NOW });
    }
  });

  it("graduates only after migration and a minimum haul", () => {
    const pending = coin({ curveProgress: 1 });
    const migrated = coin({ curveProgress: 1, graduated: true });
    expect(nextTransition({ state: "hauling", stateChangedAt: t0 }, pending, NOW)).toBeNull();
    expect(nextTransition({ state: "hauling", stateChangedAt: NOW - MIN_HAUL_MS + 1 }, migrated, NOW)).toBeNull();
    expect(nextTransition({ state: "hauling", stateChangedAt: NOW - MIN_HAUL_MS }, migrated, NOW)).toEqual({
      state: "graduated",
      at: NOW,
    });
  });

  it("departs after the graduation dwell and then stays departed", () => {
    const c = coin({ curveProgress: 1, graduated: true });
    expect(nextTransition({ state: "graduated", stateChangedAt: NOW - GRADUATION_DWELL_MS + 1 }, c, NOW)).toBeNull();
    expect(nextTransition({ state: "graduated", stateChangedAt: t0 }, c, NOW)).toEqual({
      state: "departed",
      at: t0 + GRADUATION_DWELL_MS,
    });
    expect(nextTransition({ state: "departed", stateChangedAt: t0 }, c, NOW)).toBeNull();
  });

  it("does not go backwards if curve progress drops", () => {
    const dipped = coin({ curveProgress: 0.6 });
    expect(nextTransition({ state: "hauling", stateChangedAt: t0 }, dipped, NOW)).toBeNull();
  });
});

describe("zoneForTruck", () => {
  const c = coin({ marketCapSol: 80 });

  it("holds arriving trucks at the gate, then queues them in the yard", () => {
    expect(zoneForTruck({ state: "arriving", stateChangedAt: NOW - 1, zoneId: null }, c, NOW)).toBe("entry-gate");
    expect(zoneForTruck({ state: "arriving", stateChangedAt: NOW - ARRIVE_MS, zoneId: null }, c, NOW)).toBe("yard");
  });

  it("puts each state in its zone", () => {
    const at = { stateChangedAt: NOW, zoneId: null };
    expect(zoneForTruck({ ...at, state: "docking" }, c, NOW)).toBe("launch-bay");
    expect(zoneForTruck({ ...at, state: "unloading" }, c, NOW)).toBe("launch-bay");
    expect(zoneForTruck({ ...at, state: "stored" }, c, NOW)).toBe("storage-b");
    expect(zoneForTruck({ ...at, state: "hauling" }, c, NOW)).toBe("yard");
    expect(zoneForTruck({ ...at, state: "graduated" }, c, NOW)).toBe("graduation-gate");
    expect(zoneForTruck({ ...at, state: "departed" }, c, NOW)).toBeNull();
  });

  it("keeps a stored truck's hall when its coin is unknown", () => {
    expect(zoneForTruck({ state: "stored", stateChangedAt: NOW, zoneId: "storage-c" }, undefined, NOW)).toBe(
      "storage-c",
    );
  });
});

describe("stepTruck", () => {
  it("catches up through several due transitions with accurate timestamps", () => {
    const dockedAt = NOW - 10 * 60_000;
    const next = stepTruck(
      truck({ state: "docking", zoneId: "launch-bay", dockId: "dock-2", stateChangedAt: dockedAt }),
      coin({ marketCapSol: 200 }),
      NOW,
    );
    expect(next).toMatchObject({
      state: "stored",
      stateChangedAt: dockedAt + DOCK_MS + UNLOAD_MS,
      zoneId: "storage-c",
      dockId: null,
    });
  });

  it("releases the dock when hauling pre-empts unloading", () => {
    const next = stepTruck(
      truck({ state: "unloading", zoneId: "launch-bay", dockId: "dock-1", stateChangedAt: NOW - 1000 }),
      coin({ curveProgress: 1 }),
      NOW,
    );
    expect(next).toMatchObject({ state: "hauling", stateChangedAt: NOW, zoneId: "yard", dockId: null });
  });

  it("moves a stored truck between halls as market cap changes, without a state change", () => {
    const t = truck({ state: "stored", zoneId: "storage-a" });
    const next = stepTruck(t, coin({ marketCapSol: 160 }), NOW);
    expect(next).toMatchObject({ state: "stored", zoneId: "storage-c", stateChangedAt: t.stateChangedAt });
  });

  it("returns the same object when nothing changes", () => {
    const t = truck({ state: "stored", zoneId: "storage-a" });
    expect(stepTruck(t, coin({ marketCapSol: 10 }), NOW)).toBe(t);
  });
});

describe("assignDocks", () => {
  const arriving = (n: number, waitedMs: number): Truck =>
    truck({
      id: truckIdForMint(`m${n}`),
      mint: `m${n}`,
      state: "arriving",
      zoneId: "yard",
      stateChangedAt: NOW - waitedMs,
    });

  it("only docks trucks that have cleared the gate", () => {
    const [t] = assignDocks([arriving(1, ARRIVE_MS - 1)], NOW);
    expect(t.state).toBe("arriving");
  });

  it(`fills at most ${DOCK_COUNT} docks, longest-waiting first`, () => {
    const trucks = Array.from({ length: DOCK_COUNT + 2 }, (_, i) => arriving(i, ARRIVE_MS + i * 1000));
    const result = assignDocks(trucks, NOW);
    const docked = result.filter((t) => t.state === "docking");
    expect(docked).toHaveLength(DOCK_COUNT);
    expect(new Set(docked.map((t) => t.dockId)).size).toBe(DOCK_COUNT);
    // The two most recent arrivals (i = 0, 1) wait.
    expect(result[0].state).toBe("arriving");
    expect(result[1].state).toBe("arriving");
    expect(docked.every((t) => t.zoneId === "launch-bay" && t.stateChangedAt === NOW)).toBe(true);
  });

  it("never reassigns a held dock", () => {
    const holder = truck({ id: "truck:h", mint: "h", state: "unloading", zoneId: "launch-bay", dockId: "dock-1" });
    const result = assignDocks([holder, arriving(1, ARRIVE_MS)], NOW);
    expect(result[0]).toBe(holder);
    expect(result[1].dockId).toBe("dock-2");
  });
});

describe("layoutTrucks", () => {
  it("parks docked trucks at their dock, departed trucks at the exit, others in distinct slots", () => {
    const trucks = [
      truck({ id: "truck:a", mint: "a", state: "docking", zoneId: "launch-bay", dockId: "dock-3" }),
      truck({ id: "truck:b", mint: "b", state: "departed", zoneId: null }),
      truck({ id: "truck:c", mint: "c", zoneId: "storage-a", stateChangedAt: NOW - 2 }),
      truck({ id: "truck:d", mint: "d", zoneId: "storage-a", stateChangedAt: NOW - 1 }),
    ];
    const [a, b, c, d] = layoutTrucks(trucks);
    expect(a.position).toEqual(DOCKS[2].position);
    expect(b.position).toEqual(EXIT_POSITION);
    expect(c.position).not.toEqual(d.position);
  });

  const stored = (n: number, launchedAgoMs: number) => ({
    truck: truck({ id: `truck:s${n}`, mint: `s${n}`, zoneId: "storage-a", stateChangedAt: NOW - n }),
    coin: coin({ mint: `s${n}`, createdAt: NOW - launchedAgoMs }),
  });

  it("caps a storage hall at its footprint and parks the oldest coins in the overflow lot", () => {
    const capacity = zoneCapacity("storage-a");
    const fleet = Array.from({ length: capacity + 5 }, (_, n) => stored(n, n * 60_000));
    const laid = layoutTrucks(
      fleet.map((f) => f.truck),
      new Map(fleet.map((f) => [f.coin.mint, f.coin])),
    );
    const inLot = laid.filter((t) => inOverflowLot(t.position));
    expect(inLot).toHaveLength(5);
    // The five oldest launches are the ones parked out.
    expect(inLot.map((t) => t.mint).sort()).toEqual(fleet.slice(capacity).map((f) => f.coin.mint).sort());
    // They keep their tier, and every truck has its own spot.
    expect(inLot.every((t) => t.zoneId === "storage-a")).toBe(true);
    expect(new Set(laid.map((t) => `${t.position.x},${t.position.z}`)).size).toBe(laid.length);
    // Nobody in the hall spills out of its footprint onto the avenue.
    const hall = ZONES["storage-a"];
    for (const t of laid.filter((x) => !inOverflowLot(x.position))) {
      expect(Math.abs(t.position.z - hall.center.z)).toBeLessThanOrEqual(hall.size.depth / 2);
    }
  });

  it("keeps trucks in their slots when another truck leaves", () => {
    const fleet = Array.from({ length: 6 }, (_, n) => stored(n, n * 60_000));
    const before = layoutTrucks(fleet.map((f) => f.truck));
    const after = layoutTrucks(before.filter((t) => t.mint !== "s0"));
    for (const t of after) expect(t.position).toEqual(before.find((b) => b.id === t.id)!.position);
  });
});

describe("advanceTrucks", () => {
  it("keeps exactly one truck per coin, with a unique id", () => {
    const coins = [coin({ mint: "a" }), coin({ mint: "b" }), coin({ mint: "c" })];
    const first = advanceTrucks(coins, [], NOW);
    const second = advanceTrucks(coins, first.trucks, NOW + 1000);
    expect(second.trucks).toHaveLength(3);
    expect(new Set(second.trucks.map((t) => t.id)).size).toBe(3);
    expect(second.trucks.map((t) => t.mint).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps trucks whose coin dropped out of the feed", () => {
    const { trucks } = advanceTrucks([coin({ mint: "a" }), coin({ mint: "b" })], [], NOW);
    const next = advanceTrucks([coin({ mint: "a" })], trucks, NOW + 1000);
    expect(next.trucks.find((t) => t.mint === "b")).toBe(trucks.find((t) => t.mint === "b"));
  });

  it("drives a fresh launch through intake into storage, emitting events", () => {
    const launch = coin({ mint: "new", symbol: "NEW", createdAt: NOW, marketCapSol: 28 });
    const kinds: string[] = [];
    let trucks: Truck[] = [];
    for (const at of [NOW, NOW + ARRIVE_MS, NOW + ARRIVE_MS + DOCK_MS, NOW + ARRIVE_MS + DOCK_MS + UNLOAD_MS]) {
      const r = advanceTrucks([launch], trucks, at);
      trucks = r.trucks;
      kinds.push(...r.events.map((e) => e.kind));
    }
    expect(kinds).toEqual(["arrived", "docked", "unloading", "stored"]);
    expect(trucks[0]).toMatchObject({ state: "stored", zoneId: "storage-a", dockId: null });
  });

  it("does not emit events for coins first seen mid-life", () => {
    const { events, trucks } = advanceTrucks([coin({ createdAt: NOW - 3_600_000 })], [], NOW);
    expect(trucks[0].state).toBe("stored");
    expect(events).toEqual([]);
  });

  it("emits tier_changed when a stored coin moves hall", () => {
    const c = coin({ marketCapSol: 20 });
    const { trucks } = advanceTrucks([c], [], NOW);
    const { events } = advanceTrucks([{ ...c, marketCapSol: 90 }], trucks, NOW + 1000);
    expect(events).toEqual([
      expect.objectContaining({ kind: "tier_changed", fromTier: 1, tier: 2, zoneId: "storage-b", symbol: "TST" }),
    ]);
  });

  it("hauls, graduates and departs as the coin completes and migrates", () => {
    const c = coin();
    let { trucks } = advanceTrucks([c], [], NOW);
    trucks = advanceTrucks([{ ...c, curveProgress: 1 }], trucks, NOW + 1000).trucks;
    expect(trucks[0]).toMatchObject({ state: "hauling", zoneId: "yard" });

    const migrated = { ...c, curveProgress: 1, graduated: true };
    trucks = advanceTrucks([migrated], trucks, NOW + 1000 + MIN_HAUL_MS).trucks;
    expect(trucks[0]).toMatchObject({ state: "graduated", zoneId: "graduation-gate" });

    trucks = advanceTrucks([migrated], trucks, NOW + 1000 + MIN_HAUL_MS + GRADUATION_DWELL_MS).trucks;
    expect(trucks[0]).toMatchObject({ state: "departed", zoneId: null, position: EXIT_POSITION });
  });
});

describe("createTruck", () => {
  it("derives the truck id from the mint", () => {
    expect(createTruck(coin({ mint: "XYZpump" }), NOW).id).toBe("truck:XYZpump");
  });
});

describe("summarizeHub", () => {
  it("counts launches, trucks, graduations and market cap", () => {
    const coins = [
      coin({ mint: "a", createdAt: NOW - 1000, marketCapSol: 30, marketCapUsd: 4800 }),
      coin({ mint: "b", createdAt: NOW - 2 * 86_400_000, marketCapSol: 500, marketCapUsd: 80_000, graduated: true }),
      coin({ mint: "c", createdAt: NOW - 5000, marketCapSol: 40, marketCapUsd: undefined }),
    ];
    const trucks = [truck({ mint: "a" }), truck({ mint: "b", state: "departed" }), truck({ mint: "c" })];
    expect(summarizeHub(coins, trucks, NOW)).toEqual({
      coinsLaunchedInWindow: 2,
      trucksOnFloor: 2,
      graduations: 1,
      totalMarketCapSol: 570,
      totalMarketCapUsd: 84_800,
      coinsMissingUsd: 1,
    });
  });
});
