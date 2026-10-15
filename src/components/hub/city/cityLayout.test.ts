import { describe, expect, it } from "vitest";
import { DOCKS, OVERFLOW_LOT, ROAD_SEGMENTS, ZONES, ZONE_IDS } from "@/game";
import { BUILDING_SIZES, HUB_KEEP_OUT, ROAD_CORRIDORS, SOUTH_MAX_HEIGHT, buildCity, inRect, type Building, type Rect } from "./cityLayout";

const city = buildCity();

function footprint(b: Building): Rect {
  const s = BUILDING_SIZES[b.type];
  const [w, d] = b.rotY ? [s.d, s.w] : [s.w, s.d];
  return { minX: b.x - w / 2, maxX: b.x + w / 2, minZ: b.z - d / 2, maxZ: b.z + d / 2 };
}

const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const forbidden = [HUB_KEEP_OUT, ...ROAD_CORRIDORS];

describe("city layout", () => {
  it("fills the area around the hub", () => {
    expect(city.buildings.length).toBeGreaterThan(80);
    expect(city.trees.length).toBeGreaterThan(300);
    expect(city.benches.length).toBeGreaterThan(30);
    expect(city.lamps.length).toBeGreaterThan(100);
    expect(city.cars.length).toBeGreaterThan(100);
  });

  it("never builds on the hub or the roads trucks use to enter and leave", () => {
    for (const b of city.buildings) {
      for (const r of forbidden) expect(overlaps(footprint(b), r), `${b.type} at ${b.x},${b.z}`).toBe(false);
    }
    const props = [...city.trees, ...city.benches, ...city.lamps, ...city.cars, ...city.fountains];
    for (const p of props) {
      for (const r of forbidden) expect(inRect(r, p.x, p.z), `prop at ${p.x},${p.z}`).toBe(false);
    }
    for (const s of [...city.sidewalks, ...city.grounds]) {
      expect(overlaps(s, HUB_KEEP_OUT), `ground ${JSON.stringify(s)}`).toBe(false);
    }
  });

  it("keeps everything between the hub and the camera low", () => {
    for (const b of city.buildings.filter((x) => x.z > HUB_KEEP_OUT.maxZ)) {
      expect(BUILDING_SIZES[b.type].h, `${b.type} at ${b.x},${b.z}`).toBeLessThanOrEqual(SOUTH_MAX_HEIGHT);
    }
  });

  it("doesn't stack buildings on top of each other", () => {
    const rects = city.buildings.map(footprint);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j]), `buildings ${i} and ${j}`).toBe(false);
    }
  });

  it("runs every street straight", () => {
    for (const { a, b } of city.streets) expect(a.x === b.x || a.z === b.z).toBe(true);
  });

  it("is the same city every time", () => {
    expect(buildCity()).toEqual(city);
  });
});

describe("hub container yards", () => {
  it("never touches a zone, a road, a dock or the overflow lot", () => {
    const keepClear: Rect[] = [
      ...ZONE_IDS.map((id) => {
        const z = ZONES[id];
        return { minX: z.center.x - z.size.width / 2 - 1, maxX: z.center.x + z.size.width / 2 + 1, minZ: z.center.z - z.size.depth / 2 - 1, maxZ: z.center.z + z.size.depth / 2 + 1 };
      }),
      // Roads are 6 m wide; keep a metre either side.
      ...ROAD_SEGMENTS.map(([a, b]) => ({ minX: Math.min(a.x, b.x) - 4, maxX: Math.max(a.x, b.x) + 4, minZ: Math.min(a.z, b.z) - 4, maxZ: Math.max(a.z, b.z) + 4 })),
      { minX: OVERFLOW_LOT.minX, maxX: OVERFLOW_LOT.maxX, minZ: OVERFLOW_LOT.minZ, maxZ: HUB_KEEP_OUT.maxZ },
      ...DOCKS.map((d) => ({ minX: d.position.x - 3, maxX: d.position.x + 3, minZ: d.position.z - 4, maxZ: d.position.z + 4 })),
    ];
    expect(city.containers.length).toBeGreaterThan(40);
    for (const c of city.containers) {
      const r = { minX: c.x - c.sx / 2, maxX: c.x + c.sx / 2, minZ: c.z - c.sz / 2, maxZ: c.z + c.sz / 2 };
      expect(overlaps(r, HUB_KEEP_OUT), "inside the hub").toBe(true);
      for (const k of keepClear) expect(overlaps(r, k), `container at ${c.x},${c.z} vs ${JSON.stringify(k)}`).toBe(false);
      expect(c.y + c.sy / 2).toBeLessThanOrEqual(5.2 + 1e-9); // at most two high
    }
  });
});
