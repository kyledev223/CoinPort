import { describe, expect, it } from "vitest";
import { DOCKS, EXIT_POSITION, ZONE_IDS, inOverflowLot, lotSlotPosition, slotPosition } from "./layout";
import { ROAD_SEGMENTS, SPAWN_POINT, routeBetween, type Waypoint } from "./roads";
import type { DockId, ZoneId } from "./types";

type Spot = { p: Waypoint; zoneId: ZoneId | null; dockId: DockId | null; label: string };

const spots: Spot[] = [
  ...ZONE_IDS.filter((z) => z !== "launch-bay").flatMap((zoneId) =>
    [0, 3, 8, 13].map((i) => ({ p: slotPosition(zoneId, i), zoneId, dockId: null, label: `${zoneId}#${i}` })),
  ),
  ...DOCKS.map((d) => ({ p: d.position, zoneId: "launch-bay" as const, dockId: d.id, label: d.id })),
  ...[0, 5, 31, 80].map((i) => ({ p: lotSlotPosition(i), zoneId: "storage-b" as const, dockId: null, label: `lot#${i}` })),
];

const axisAligned = (a: Waypoint, b: Waypoint) => Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.z - b.z) < 1e-6;

describe("straight roads", () => {
  it("draws every road straight north–south or east–west", () => {
    for (const [a, b] of ROAD_SEGMENTS) expect(axisAligned(a, b), `${a.x},${a.z} → ${b.x},${b.z}`).toBe(true);
  });

  it("plans every trip as straight right-angled legs, entering bays head-on", () => {
    const origins = [...spots.map((s) => s.p), SPAWN_POINT];
    for (const from of origins) {
      for (const to of [...spots, { p: EXIT_POSITION, zoneId: null, dockId: null, label: "exit" }]) {
        if (from.x === to.p.x && from.z === to.p.z) continue;
        const route = routeBetween(from, to.p, to);
        const legs = [from, ...route];
        for (let i = 1; i < legs.length; i++) {
          expect(axisAligned(legs[i - 1], legs[i]), `${from.x},${from.z} → ${to.label}: leg ${i}`).toBe(true);
        }
        expect(route.at(-1)).toMatchObject({ x: to.p.x, z: to.p.z });

        // The final non-zero leg: north/south into zone bays and docks, east/west into lot bays.
        const finalFrom = [...legs].reverse().find((w) => w.x !== to.p.x || w.z !== to.p.z);
        if (!finalFrom || to.label === "exit") continue;
        if (inOverflowLot(to.p)) expect(finalFrom.z, `into ${to.label}`).toBeCloseTo(to.p.z, 6);
        else expect(finalFrom.x, `into ${to.label}`).toBeCloseTo(to.p.x, 6);
      }
    }
  });

  it("backs into docks", () => {
    const dock = DOCKS[2];
    const route = routeBetween(SPAWN_POINT, dock.position, { zoneId: "launch-bay", dockId: dock.id });
    expect(route.at(-1)?.reverse).toBe(true);
  });
});
