import { describe, expect, it } from "vitest";
import { GRADUATION_DWELL_MS } from "./constants";
import { CRATES_PER_TRUCK, forkliftPose, unloadSpots } from "./crew";
import { DOCK_COUNT } from "./constants";
import { createForklifts } from "./forklifts";
import { motionEndsAt, sampleMotion } from "./motion";
import { GRADUATION_ARCH_Z, SPAWN_POINT } from "./roads";
import { truckIdForMint } from "./rules";
import type { Coin } from "./types";
import { createWorld, stepWorld, type World } from "./world";

const T0 = 1_800_000_000_000;

function coin(mint: string, overrides: Partial<Coin> = {}): Coin {
  return {
    mint,
    name: mint,
    symbol: mint.toUpperCase(),
    imageUrl: "",
    metadataUri: "",
    creatorWallet: "w",
    createdAt: T0 - 3_600_000,
    marketCapSol: 30,
    curveProgress: 0.1,
    graduated: false,
    ...overrides,
  };
}

const byMint = (...coins: Coin[]) => Object.fromEntries(coins.map((c) => [c.mint, c]));

/** Step once a second from `from` to `to`, checking no truck or forklift ever jumps. */
function run(world: World, coins: Record<string, Coin>, from: number, to: number): World {
  let w = world;
  for (let now = from; now <= to; now += 1000) {
    const next = stepWorld(w, coins, now);
    for (const [id, m] of Object.entries(next.motions)) {
      const prev = w.motions[id as keyof typeof w.motions];
      if (!prev || prev === m) continue;
      const before = sampleMotion(prev, now);
      const after = sampleMotion(m, now);
      expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(1e-6);
    }
    for (const f of next.forklifts) {
      const prev = w.forkliftMotions[f.id];
      const m = next.forkliftMotions[f.id];
      if (prev === m) continue;
      const before = forkliftPose(w.forklifts.find((x) => x.id === f.id)!, prev, now);
      const after = forkliftPose(f, m, now);
      expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(1e-6);
    }
    w = next;
  }
  return w;
}

describe("stepWorld", () => {
  it("places trucks already in the hub on the first step", () => {
    const w = stepWorld(createWorld([], T0), byMint(coin("a")), T0);
    const t = w.trucks[0];
    expect(sampleMotion(w.motions[t.id], T0)).toMatchObject({ x: t.position.x, z: t.position.z, arrived: true });
  });

  it("drives a new launch in from off-map and through intake, never teleporting", () => {
    let w = stepWorld(createWorld(createForklifts(), T0), {}, T0);
    const coins = byMint(coin("new", { createdAt: T0 + 1000 }));
    w = stepWorld(w, coins, T0 + 1000);
    const id = truckIdForMint("new");
    expect(sampleMotion(w.motions[id], T0 + 1000)).toMatchObject({ x: SPAWN_POINT.x, z: SPAWN_POINT.z });

    w = run(w, coins, T0 + 2000, T0 + 30_000);
    const truck = w.trucks.find((t) => t.id === id)!;
    expect(truck.state).toBe("unloading");
    // A crew forklift is at the trailer and crates are coming off.
    const crew = w.forklifts.find((f) => f.truckId === id)!;
    expect(crew.position).toEqual(unloadSpots(truck.dockId!).pickup);
    expect(w.bays[truck.dockId!].crates).toBeGreaterThan(0);

    w = run(w, coins, T0 + 31_000, T0 + 70_000);
    expect(w.trucks.find((t) => t.id === id)!.state).toBe("stored");
    expect(w.forklifts.every((f) => f.truckId === null)).toBe(true);
    expect(Object.values(w.bays).every((b) => b.truckId === null && b.crates === 0)).toBe(true);
  });

  it("fills the crates as unloading completes", () => {
    let w = stepWorld(createWorld(createForklifts(), T0), {}, T0);
    const coins = byMint(coin("c", { createdAt: T0 }));
    w = run(w, coins, T0 + 1000, T0 + 39_000);
    const truck = w.trucks[0];
    expect(truck.state).toBe("unloading");
    expect(w.bays[truck.dockId!].crates).toBe(CRATES_PER_TRUCK - 1);
  });

  it("queues trucks in the Yard when every dock is taken", () => {
    let w = stepWorld(createWorld([], T0), {}, T0);
    const coins = byMint(...Array.from({ length: DOCK_COUNT + 1 }, (_, i) => coin(`q${i}`, { createdAt: T0 + 1000 + i })));
    w = run(w, coins, T0 + 1000, T0 + 8000);
    expect(w.trucks.filter((t) => t.dockId)).toHaveLength(DOCK_COUNT);
    expect(w.trucks.filter((t) => t.zoneId === "yard")).toHaveLength(1);
  });

  it("drives a graduated truck out through the Graduation Gate, flashes it, then removes the truck for good", () => {
    const coins = byMint(coin("g", { curveProgress: 1, graduated: true, marketCapSol: 500 }));
    let w = stepWorld(createWorld([], T0), coins, T0);
    expect(w.trucks[0].state).toBe("graduated");

    w = run(w, coins, T0 + 1000, T0 + GRADUATION_DWELL_MS);
    const truck = w.trucks[0];
    expect(truck.state).toBe("departed");
    const m = w.motions[truck.id];
    const flash = w.gateFlashes[0];
    expect(flash).toBeGreaterThan(T0 + GRADUATION_DWELL_MS - 1);
    expect(sampleMotion(m, flash).z).toBeCloseTo(GRADUATION_ARCH_Z, 4);

    w = run(w, coins, T0 + GRADUATION_DWELL_MS + 1000, Math.ceil(motionEndsAt(m) / 1000) * 1000 + 1000);
    expect(w.trucks).toHaveLength(0);
    expect(w.retired.g).toBe(true);
    expect(stepWorld(w, coins, w.now + 1000).trucks).toHaveLength(0);
  });

  it("keeps a short activity log", () => {
    let w = stepWorld(createWorld([], T0), {}, T0);
    w = stepWorld(w, byMint(coin("e", { createdAt: T0 + 1000 })), T0 + 1000);
    expect(w.events.map((e) => e.kind)).toEqual(["arrived"]);
    expect(w.history[truckIdForMint("e")].arriving).toBe(T0 + 1000);
  });
});
