/**
 * The city around the hub: streets, blocks, buildings and street furniture.
 * Decoration only (nothing here affects the game), generated deterministically
 * from a seed so the city looks the same on every load. Pure: no three.js.
 *
 * Rules that keep the hub usable:
 * - Nothing is placed inside HUB_KEEP_OUT, on the truck spawn road or on the exit road.
 * - Buildings south of the hub (between it and the camera) stay low.
 */

import { EXIT_POSITION, SPAWN_POINT } from "@/game";

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Placed {
  x: number;
  z: number;
  /** Yaw in radians. */
  rotY: number;
  scale: number;
  /** Tint, as a CSS colour. */
  color: string;
}

export type BuildingType = "tower-a" | "tower-b" | "tower-c" | "office" | "mid" | "low" | "shop";

/** Fixed sizes per type (m), so facade textures tile at a constant window size. */
export const BUILDING_SIZES: Record<BuildingType, { w: number; d: number; h: number }> = {
  "tower-a": { w: 16, d: 16, h: 64 },
  "tower-b": { w: 18, d: 14, h: 46 },
  "tower-c": { w: 14, d: 14, h: 84 },
  office: { w: 36, d: 18, h: 30 },
  mid: { w: 18, d: 18, h: 22 },
  low: { w: 18, d: 14, h: 10 },
  shop: { w: 12, d: 10, h: 6 },
};

export interface Building extends Placed {
  type: BuildingType;
}

export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface CityLayout {
  /** Street centre lines; every one runs north–south or east–west. */
  streets: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }>;
  /** Raised sidewalk plinths around blocks and along the inside of the ring road. */
  sidewalks: Rect[];
  /** Block interiors. */
  grounds: Array<Rect & { kind: "paved" | "grass" }>;
  /** Park walkways and the waterfront promenade. */
  paths: Rect[];
  buildings: Building[];
  roofUnits: Box[];
  /** Tower masts: base position and top height. */
  antennas: Array<{ x: number; z: number; y: number }>;
  trees: Placed[];
  benches: Placed[];
  lamps: Placed[];
  cars: Placed[];
  fountains: Placed[];
  /** Zebra stripes. */
  crosswalks: Box[];
  /** Shipping containers stacked in the hub's empty corners. */
  containers: Array<Box & { color: string }>;
  fence: { posts: Array<{ x: number; z: number }>; rails: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }> };
  water: Rect;
}

/** The hub and everything it uses. City objects never go in here. */
export const HUB_KEEP_OUT: Rect = { minX: -86, maxX: 98, minZ: -72, maxZ: 76 };
/** Ring road around the hub (street centre lines). */
export const RING = { west: -95, east: 129, north: -81, south: 87 } as const;
/** South of the hub (toward the camera) buildings stay at or below this height (m). */
export const SOUTH_MAX_HEIGHT = 8;
/** The harbour: water starts here. */
export const WATER_EDGE_Z = 156;

const PITCH = 56;
const ROAD = 10;
const WALK = 3;
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
export const GRID_X = range(-263, 297, PITCH);
export const GRID_Z = range(-249, 143, PITCH);

/** Corridors hub roads use to reach the ring road. */
const SPAWN_CORRIDOR: Rect = { minX: SPAWN_POINT.x - 6, maxX: SPAWN_POINT.x + 6, minZ: HUB_KEEP_OUT.maxZ, maxZ: SPAWN_POINT.z };
const EXIT_CORRIDOR: Rect = { minX: HUB_KEEP_OUT.maxX, maxX: EXIT_POSITION.x, minZ: EXIT_POSITION.z - 6, maxZ: EXIT_POSITION.z + 6 };
export const ROAD_CORRIDORS: readonly Rect[] = [SPAWN_CORRIDOR, EXIT_CORRIDOR];

export const inRect = (r: Rect, x: number, z: number, margin = 0) =>
  x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin;

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Empty floor inside the hub that gets container stacks: beside the spawn
 * road, south of the dock apron, and west of the Yard. Stacks stay low enough
 * (from the camera's side) not to hide the apron, the avenue or any zone.
 */
export const CONTAINER_YARDS: ReadonlyArray<{ area: Rect; maxLevels: number }> = [
  { area: { minX: -84, maxX: -66, minZ: 44, maxZ: 74 }, maxLevels: 2 },
  { area: { minX: -54, maxX: -14, minZ: 44, maxZ: 74 }, maxLevels: 2 },
  { area: { minX: -2, maxX: 34, minZ: 44, maxZ: 74 }, maxLevels: 2 },
  { area: { minX: -84, maxX: -44, minZ: -10, maxZ: 16 }, maxLevels: 1 },
];
const CONTAINER_COLORS = ["#a5432f", "#2f5f8f", "#2f7a4f", "#c9762b", "#6d7480", "#2f8a8a", "#8a3a5a", "#b59a3a"];

const FACADE_TINTS = ["#9aa3ad", "#b8b0a2", "#8f9bb0", "#a8a39a", "#c2b8a8", "#7f8a96", "#a59588", "#8c97a3"];
const SHOP_TINTS = ["#c9a27e", "#b98d6b", "#9fb1a6", "#c4b296", "#a8b5c4"];
const CAR_COLORS = ["#c0392b", "#2c6fbb", "#e6e6e6", "#1f2328", "#7a7f87", "#d4a017", "#2e8b57", "#5b3a8c", "#b0b7bf"];
const LEAF_COLORS = ["#2f6b3a", "#3b7a44", "#285c33", "#4a8a4c", "#356e3f"];

/** Whether the street on grid line `x` (running north–south) covers z. */
function xStreetCovers(x: number, z: number): boolean {
  if (z < GRID_Z[0] || z > GRID_Z.at(-1)!) return false;
  if (x > RING.west && x < RING.east) return z <= RING.north || z >= RING.south;
  return true;
}

/** Whether the street on grid line `z` (running east–west) covers x. */
function zStreetCovers(z: number, x: number): boolean {
  if (x < GRID_X[0] || x > GRID_X.at(-1)!) return false;
  if (z > RING.north && z < RING.south) return x <= RING.west || x >= RING.east;
  return true;
}

export function buildCity(seed = 7): CityLayout {
  const rand = prng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const layout: CityLayout = {
    streets: [],
    sidewalks: [],
    grounds: [],
    paths: [],
    buildings: [],
    roofUnits: [],
    antennas: [],
    trees: [],
    benches: [],
    lamps: [],
    cars: [],
    fountains: [],
    crosswalks: [],
    containers: [],
    fence: { posts: [], rails: [] },
    water: { minX: GRID_X[0] - 200, maxX: GRID_X.at(-1)! + 200, minZ: WATER_EDGE_Z, maxZ: WATER_EDGE_Z + 300 },
  };

  const blocked = (x: number, z: number, margin = 0) =>
    inRect(HUB_KEEP_OUT, x, z, margin) || ROAD_CORRIDORS.some((r) => inRect(r, x, z, margin));
  const tree = (x: number, z: number, scale = 0.8 + rand() * 0.5) => {
    if (!blocked(x, z, 2)) layout.trees.push({ x, z, rotY: rand() * Math.PI * 2, scale, color: pick(LEAF_COLORS) });
  };
  const bench = (x: number, z: number, rotY: number) => {
    if (!blocked(x, z, 1)) layout.benches.push({ x, z, rotY, scale: 1, color: "#6b4a2e" });
  };
  const lamp = (x: number, z: number) => {
    if (!blocked(x, z, 1)) layout.lamps.push({ x, z, rotY: 0, scale: 1, color: "#ffd68a" });
  };

  // --- Streets (axis-aligned), with parked cars along the kerbs.
  const zMin = GRID_Z[0];
  const zMax = GRID_Z.at(-1)!;
  const xMin = GRID_X[0];
  const xMax = GRID_X.at(-1)!;
  for (const x of GRID_X) {
    const spans: Array<[number, number]> = x > RING.west && x < RING.east ? [[zMin, RING.north], [RING.south, zMax]] : [[zMin, zMax]];
    for (const [a, b] of spans) layout.streets.push({ a: { x, z: a }, b: { x, z: b } });
  }
  for (const z of GRID_Z) {
    const spans: Array<[number, number]> = z > RING.north && z < RING.south ? [[xMin, RING.west], [RING.east, xMax]] : [[xMin, xMax]];
    for (const [a, b] of spans) layout.streets.push({ a: { x: a, z }, b: { x: b, z } });
  }
  const nearTruckRoute = (x: number, z: number) =>
    Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z) < 18 || Math.hypot(x - EXIT_POSITION.x, z - EXIT_POSITION.z) < 18;
  for (const { a, b } of layout.streets) {
    const alongX = a.z === b.z;
    const len = alongX ? b.x - a.x : b.z - a.z;
    for (let s = 9; s < len - 9; s += 6.5) {
      for (const side of [-1, 1]) {
        if (rand() > 0.33) continue;
        const along = (alongX ? a.x : a.z) + s;
        // Keep clear of intersections.
        const nearCross = (alongX ? GRID_X : GRID_Z).some((g) => Math.abs(g - along) < 9);
        if (nearCross) continue;
        const x = alongX ? along : a.x + side * (ROAD / 2 - 1.3);
        const z = alongX ? a.z + side * (ROAD / 2 - 1.3) : along;
        if (nearTruckRoute(x, z) || blocked(x, z)) continue;
        const rotY = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
        layout.cars.push({ x, z, rotY, scale: 1, color: pick(CAR_COLORS) });
      }
    }
  }

  // --- Crosswalks at intersections, on every street arm that exists.
  for (const x of GRID_X) {
    for (const z of GRID_Z) {
      if (!xStreetCovers(x, z) || !zStreetCovers(z, x)) continue;
      const arms: Array<[number, number, boolean]> = [
        [x, z - 7.5, xStreetCovers(x, z - 8)],
        [x, z + 7.5, xStreetCovers(x, z + 8)],
        [x - 7.5, z, zStreetCovers(z, x - 8)],
        [x + 7.5, z, zStreetCovers(z, x + 8)],
      ];
      for (const [cx, cz, exists] of arms) {
        if (!exists) continue;
        const acrossX = cx === x; // crossing a north–south street: stripes spaced along x
        for (let k = -2; k <= 2; k++) {
          layout.crosswalks.push(
            acrossX
              ? { x: cx + k * 1.7, y: 0.06, z: cz, sx: 0.8, sy: 0.02, sz: 3 }
              : { x: cx, y: 0.06, z: cz + k * 1.7, sx: 3, sy: 0.02, sz: 0.8 },
          );
        }
      }
    }
  }

  // --- Blocks.
  for (let i = 0; i < GRID_X.length - 1; i++) {
    for (let j = 0; j < GRID_Z.length - 1; j++) {
      const [x0, x1, z0, z1] = [GRID_X[i], GRID_X[i + 1], GRID_Z[j], GRID_Z[j + 1]];
      if (x0 >= RING.west && x1 <= RING.east && z0 >= RING.north && z1 <= RING.south) continue; // the hub
      const plinth = { minX: x0 + ROAD / 2, maxX: x1 - ROAD / 2, minZ: z0 + ROAD / 2, maxZ: z1 - ROAD / 2 };
      const net = { minX: plinth.minX + WALK, maxX: plinth.maxX - WALK, minZ: plinth.minZ + WALK, maxZ: plinth.maxZ - WALK };
      layout.sidewalks.push(plinth);
      const south = z0 >= RING.south;
      const north = z1 <= RING.north;
      const cx = (net.minX + net.maxX) / 2;
      const cz = (net.minZ + net.maxZ) / 2;

      // Street trees and lamps along the sidewalk.
      for (const [ax, az, bx, bz] of [
        [plinth.minX, plinth.minZ + 1.5, plinth.maxX, plinth.minZ + 1.5],
        [plinth.minX, plinth.maxZ - 1.5, plinth.maxX, plinth.maxZ - 1.5],
        [plinth.minX + 1.5, plinth.minZ, plinth.minX + 1.5, plinth.maxZ],
        [plinth.maxX - 1.5, plinth.minZ, plinth.maxX - 1.5, plinth.maxZ],
      ] as Array<[number, number, number, number]>) {
        const len = Math.max(bx - ax, bz - az);
        for (let s = 6; s <= len - 6; s += 11) {
          const t = s / len;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          if (Math.round(s / 11) % 3 === 1) lamp(x, z);
          else tree(x, z, 0.75 + rand() * 0.3);
        }
      }

      const kind = blockKind(rand, south, north);
      if (kind === "park" || kind === "plaza") {
        layout.grounds.push({ ...net, kind: kind === "park" ? "grass" : "paved" });
        // Cross-shaped walkways with benches facing them.
        layout.paths.push({ minX: net.minX, maxX: net.maxX, minZ: cz - 1.5, maxZ: cz + 1.5 }, { minX: cx - 1.5, maxX: cx + 1.5, minZ: net.minZ, maxZ: net.maxZ });
        for (const d of [-12, 12]) {
          bench(cx + d, cz - 2.8, 0);
          bench(cx + d, cz + 2.8, Math.PI);
          bench(cx - 2.8, cz + d, Math.PI / 2);
          bench(cx + 2.8, cz + d, -Math.PI / 2);
        }
        if (kind === "plaza") layout.fountains.push({ x: cx, z: cz, rotY: 0, scale: 1, color: "#7aa7c7" });
        // Trees in each quarter of the park (fewer, around the edge, on a plaza).
        for (const qx of [-1, 1]) {
          for (const qz of [-1, 1]) {
            const n = kind === "park" ? 5 : 2;
            for (let k = 0; k < n; k++) tree(cx + qx * (5 + rand() * 13), cz + qz * (5 + rand() * 13));
          }
        }
        continue;
      }

      layout.grounds.push({ ...net, kind: "paved" });
      const quads: Array<[number, number]> = [
        [cx - 10, cz - 10],
        [cx + 10, cz - 10],
        [cx - 10, cz + 10],
        [cx + 10, cz + 10],
      ];
      let free = quads;
      if (kind === "office") {
        const top = rand() < 0.5;
        addBuilding(layout, rand, "office", cx, top ? cz - 10 : cz + 10, 0, pick(FACADE_TINTS));
        free = quads.filter(([, qz]) => (top ? qz > cz : qz < cz));
      }
      for (const [qx, qz] of free) {
        const type = quadrantType(rand, south, north);
        if (!type) {
          tree(qx + (rand() - 0.5) * 6, qz + (rand() - 0.5) * 6, 1.1);
          continue;
        }
        const size = BUILDING_SIZES[type];
        const rot = size.w !== size.d && rand() < 0.5 ? Math.PI / 2 : 0;
        const fw = rot ? size.d : size.w;
        const fd = rot ? size.w : size.d;
        const jx = (rand() - 0.5) * Math.max(0, 19 - fw);
        const jz = (rand() - 0.5) * Math.max(0, 19 - fd);
        addBuilding(layout, rand, type, qx + jx, qz + jz, rot, pick(type === "shop" ? SHOP_TINTS : FACADE_TINTS));
      }
    }
  }

  // --- Inside the ring road: inner sidewalks, and a tree-lined green strip east of the hub.
  const inner = 5 + WALK;
  layout.sidewalks.push(
    { minX: RING.west + 5, maxX: RING.east - 5, minZ: RING.north + 5, maxZ: RING.north + inner },
    { minX: RING.west + 5, maxX: RING.east - 5, minZ: RING.south - inner, maxZ: RING.south - 5 },
    { minX: RING.west + 5, maxX: RING.west + inner, minZ: RING.north + 5, maxZ: RING.south - 5 },
    { minX: RING.east - inner, maxX: RING.east - 5, minZ: RING.north + 5, maxZ: RING.south - 5 },
  );
  const strip = { minX: HUB_KEEP_OUT.maxX + 1, maxX: RING.east - inner, minZ: RING.north + inner, maxZ: RING.south - inner };
  layout.grounds.push({ ...strip, kind: "grass" });
  for (let z = strip.minZ + 5; z < strip.maxZ - 3; z += 9) {
    tree(strip.minX + 6 + (rand() - 0.5) * 3, z);
    tree(strip.maxX - 5 + (rand() - 0.5) * 3, z + 4);
    if (rand() < 0.25) bench((strip.minX + strip.maxX) / 2, z, rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  }
  for (let s = RING.north + 12; s < RING.south - 8; s += 22) {
    lamp(RING.west + 5 + 1, s);
    lamp(RING.east - 5 - 1, s);
  }
  for (let s = RING.west + 12; s < RING.east - 8; s += 22) {
    lamp(s, RING.north + 5 + 1);
    lamp(s, RING.south - 5 - 1);
  }

  // --- Waterfront: a promenade along the harbour with benches, trees and lamps.
  const promenade = { minX: xMin, maxX: xMax, minZ: zMax + ROAD / 2, maxZ: WATER_EDGE_Z };
  layout.paths.push(promenade);
  for (let x = xMin + 6; x < xMax - 6; x += 10) {
    const k = Math.round((x - xMin) / 10) % 4;
    if (k === 0) lamp(x, WATER_EDGE_Z - 1);
    else if (k === 2) bench(x, WATER_EDGE_Z - 2.2, Math.PI);
    else tree(x, promenade.minZ + 2, 0.9);
  }

  // --- Container stacks in the hub's empty corners (clear of every zone and road).
  for (const yard of CONTAINER_YARDS) {
    const LEN = 12.2;
    const WID = 2.5;
    const HIGH = 2.6;
    // Rows run east–west in pairs, with a 3 m aisle between pairs.
    for (let z = yard.area.minZ + WID / 2, row = 0; z + WID / 2 <= yard.area.maxZ; z += WID + (row % 2 ? 3 : 0.3), row++) {
      for (let x = yard.area.minX + LEN / 2; x + LEN / 2 <= yard.area.maxX; x += LEN + 0.6) {
        if (rand() < 0.18) continue; // gaps look lived-in
        const levels = 1 + Math.floor(rand() * yard.maxLevels);
        for (let l = 0; l < levels; l++) {
          layout.containers.push({ x, y: HIGH / 2 + l * HIGH, z, sx: LEN, sy: HIGH, sz: WID, color: pick(CONTAINER_COLORS) });
        }
      }
    }
  }

  // --- A low fence around the hub, open where its roads cross.
  const k = HUB_KEEP_OUT;
  const gaps: Rect[] = ROAD_CORRIDORS.map((r) => ({ minX: r.minX - 0.5, maxX: r.maxX + 0.5, minZ: r.minZ - 0.5, maxZ: r.maxZ + 0.5 }));
  const side = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    let runStart: { x: number; z: number } | null = null;
    let prev: { x: number; z: number } | null = null;
    for (let s = 0; s <= len + 1e-6; s += 4) {
      const p = { x: ax + ((bx - ax) * s) / len, z: az + ((bz - az) * s) / len };
      const open = gaps.some((g) => inRect(g, p.x, p.z));
      if (!open) {
        layout.fence.posts.push(p);
        runStart ??= p;
        prev = p;
      } else if (runStart && prev) {
        layout.fence.rails.push({ a: runStart, b: prev });
        runStart = null;
      }
    }
    if (runStart && prev && prev !== runStart) layout.fence.rails.push({ a: runStart, b: prev });
  };
  side(k.minX, k.minZ, k.maxX, k.minZ);
  side(k.minX, k.maxZ, k.maxX, k.maxZ);
  side(k.minX, k.minZ, k.minX, k.maxZ);
  side(k.maxX, k.minZ, k.maxX, k.maxZ);

  return layout;
}

function blockKind(rand: () => number, south: boolean, north: boolean): "park" | "plaza" | "office" | "buildings" {
  const r = rand();
  if (south) return r < 0.45 ? "park" : r < 0.65 ? "plaza" : "buildings";
  if (north) return r < 0.1 ? "park" : r < 0.3 ? "office" : "buildings";
  return r < 0.15 ? "park" : r < 0.22 ? "plaza" : r < 0.35 ? "office" : "buildings";
}

/** Building type for one quarter of a block, or null for an open corner with a tree. */
function quadrantType(rand: () => number, south: boolean, north: boolean): BuildingType | null {
  const r = rand();
  if (south) return r < 0.6 ? "shop" : null;
  if (north) return r < 0.08 ? "tower-c" : r < 0.35 ? "tower-a" : r < 0.6 ? "tower-b" : r < 0.88 ? "mid" : null;
  return r < 0.1 ? "tower-b" : r < 0.45 ? "mid" : r < 0.75 ? "low" : r < 0.92 ? "shop" : null;
}

function addBuilding(layout: CityLayout, rand: () => number, type: BuildingType, x: number, z: number, rotY: number, color: string) {
  const size = BUILDING_SIZES[type];
  layout.buildings.push({ type, x, z, rotY, scale: 1, color });
  const fw = rotY ? size.d : size.w;
  const fd = rotY ? size.w : size.d;
  if (type.startsWith("tower")) {
    layout.antennas.push({ x, z, y: size.h });
    return;
  }
  // Rooftop plant: a few boxes, kept inside the roof edge.
  const units = 1 + Math.floor(rand() * 3);
  for (let u = 0; u < units; u++) {
    const sx = 2 + rand() * 2.5;
    const sz = 2 + rand() * 2.5;
    layout.roofUnits.push({
      x: x + (rand() - 0.5) * (fw - sx - 2),
      y: size.h + 0.75,
      z: z + (rand() - 0.5) * (fd - sz - 2),
      sx,
      sy: 1.5,
      sz,
    });
  }
}
