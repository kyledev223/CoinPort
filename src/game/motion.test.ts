import { describe, expect, it } from "vitest";
import { OVERFLOW_LOT, lotSlotPosition, slotPosition } from "./layout";
import { motionEndsAt, planMotion, sampleMotion, stationaryMotion, timeCrossingZ, yawToward } from "./motion";
import { routeBetween } from "./roads";

const T0 = 1_000_000;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe("motion", () => {
  const north = yawToward(0, -1);
  const east = yawToward(1, 0);
  // 20 m north, then 20 m east, at 10 m/s.
  const m = planMotion({ x: 0, z: 0, yaw: north }, [{ x: 0, z: -20 }, { x: 20, z: -20 }], {
    now: T0,
    speed: 10,
    targetKey: "k",
  });

  it("moves at a steady speed along the path", () => {
    expect(sampleMotion(m, T0)).toMatchObject({ x: 0, z: 0, arrived: false });
    expect(sampleMotion(m, T0 + 1000)).toMatchObject({ x: 0, z: -10 });
    expect(sampleMotion(m, T0 + 3000)).toMatchObject({ x: 10, z: -20 });
    expect(motionEndsAt(m)).toBe(T0 + 4000);
    expect(sampleMotion(m, T0 + 9999)).toMatchObject({ x: 20, z: -20, arrived: true });
  });

  it("turns smoothly through corners", () => {
    expect(angleDiff(sampleMotion(m, T0 + 1000).yaw, north)).toBeLessThan(1e-9);
    expect(angleDiff(sampleMotion(m, T0 + 3000).yaw, east)).toBeLessThan(1e-9);
    let prev = sampleMotion(m, T0).yaw;
    for (let t = T0; t <= T0 + 4000; t += 20) {
      const yaw = sampleMotion(m, t).yaw;
      expect(angleDiff(yaw, prev)).toBeLessThan(0.12); // never snaps
      prev = yaw;
    }
  });

  it("swings from the parked heading onto the first leg instead of snapping", () => {
    const parkedSouth = planMotion({ x: 0, z: 0, yaw: Math.PI }, [{ x: 0, z: -20 }], { now: T0, speed: 10, targetKey: "k" });
    expect(angleDiff(sampleMotion(parkedSouth, T0).yaw, Math.PI)).toBeLessThan(1e-9);
    expect(angleDiff(sampleMotion(parkedSouth, T0 + 1000).yaw, north)).toBeLessThan(1e-9);
  });

  it("faces away from travel on reverse legs", () => {
    const backIn = planMotion({ x: 0, z: 0, yaw: Math.PI }, [{ x: 0, z: -7, reverse: true }], {
      now: T0,
      speed: 7,
      targetKey: "k",
    });
    expect(angleDiff(sampleMotion(backIn, T0 + 900).yaw, Math.PI)).toBeLessThan(1e-9);
  });

  it("reports when the path crosses a line", () => {
    expect(timeCrossingZ(m, -5)).toBe(T0 + 500);
    expect(timeCrossingZ(m, 50)).toBeNull();
  });

  it("stays put when stationary", () => {
    const still = stationaryMotion({ x: 3, z: 4, yaw: 1 }, T0, "k");
    expect(sampleMotion(still, T0 + 5000)).toEqual({ x: 3, z: 4, yaw: 1, arrived: true });
  });
});

describe("overflow lot routing", () => {
  it("drives into the lot down its aisle", () => {
    const from = slotPosition("storage-c", 0);
    const to = lotSlotPosition(30);
    const route = routeBetween(from, to, { zoneId: "storage-c", dockId: null });
    expect(route.at(-1)).toMatchObject({ x: to.x, z: to.z });
    expect(route.at(-2)).toEqual({ x: OVERFLOW_LOT.aisleX, z: to.z });
    // Moving within the lot stays on the aisle.
    const within = routeBetween(to, lotSlotPosition(2), { zoneId: "storage-c", dockId: null });
    expect(within.slice(0, 2).every((w) => w.x === OVERFLOW_LOT.aisleX)).toBe(true);
  });
});
