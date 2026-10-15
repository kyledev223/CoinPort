/**
 * Static hub map: zones, docks and parking slots in world space.
 * Origin is the hub centre; +x is east, +z is south (toward the camera).
 */

import { DOCK_COUNT } from "./constants";
import type { Dock, DockId, StorageTier, StorageZoneId, Vec3, Zone, ZoneId } from "./types";

const DOCK_SPACING = 6;
const LAUNCH_BAY_CENTER: Vec3 = { x: 15, y: 0, z: 15 };

export const DOCKS: readonly Dock[] = Array.from({ length: DOCK_COUNT }, (_, i) => ({
  id: `dock-${i + 1}` as DockId,
  zoneId: "launch-bay" as const,
  number: i + 1,
  position: {
    x: LAUNCH_BAY_CENTER.x + (i - (DOCK_COUNT - 1) / 2) * DOCK_SPACING,
    y: 0,
    z: LAUNCH_BAY_CENTER.z + 11,
  },
  heading: Math.PI, // nose out, tail against the bay door
}));

export const DOCK_IDS: readonly DockId[] = DOCKS.map((d) => d.id);

export const ZONES: Readonly<Record<ZoneId, Zone>> = {
  "entry-gate": {
    id: "entry-gate",
    kind: "entry",
    label: "Entry Gate",
    center: { x: -60, y: 0, z: 30 },
    size: { width: 20, depth: 16 },
    dockIds: [],
  },
  "launch-bay": {
    id: "launch-bay",
    kind: "launch-bay",
    label: "Launch Bay",
    center: LAUNCH_BAY_CENTER,
    size: { width: 40, depth: 20 },
    dockIds: [...DOCK_IDS],
  },
  yard: {
    id: "yard",
    kind: "yard",
    label: "Yard",
    center: { x: -25, y: 0, z: 10 },
    size: { width: 28, depth: 32 },
    dockIds: [],
  },
  "storage-a": {
    id: "storage-a",
    kind: "storage",
    label: "Tier 1",
    subtitle: "Discovery",
    tier: 1,
    center: { x: -50, y: 0, z: -40 },
    size: { width: 28, depth: 24 },
    dockIds: [],
  },
  "storage-b": {
    id: "storage-b",
    kind: "storage",
    label: "Tier 2",
    subtitle: "Growth",
    tier: 2,
    center: { x: -15, y: 0, z: -40 },
    size: { width: 28, depth: 24 },
    dockIds: [],
  },
  "storage-c": {
    id: "storage-c",
    kind: "storage",
    label: "Tier 3",
    subtitle: "Elite",
    tier: 3,
    center: { x: 20, y: 0, z: -40 },
    size: { width: 28, depth: 24 },
    dockIds: [],
  },
  "graduation-gate": {
    id: "graduation-gate",
    kind: "graduation",
    label: "Graduation Gate",
    center: { x: 55, y: 0, z: -35 },
    size: { width: 24, depth: 16 },
    dockIds: [],
  },
};

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

export const STORAGE_ZONE_BY_TIER: Readonly<Record<StorageTier, StorageZoneId>> = {
  1: "storage-a",
  2: "storage-b",
  3: "storage-c",
};

/** Where departed trucks leave the hub: out the east road onto the city ring road. */
export const EXIT_POSITION: Vec3 = { x: 129, y: 0, z: -50 };

/** Footprint of one parking slot (a truck plus clearance). */
export const SLOT_SIZE = { width: 4, depth: 8 } as const;

/**
 * Parking spot for the `index`-th truck in a zone, filling rows west to east,
 * north to south. Indices past the footprint keep going south; storage halls
 * never use those (full halls overflow into the overflow lot instead).
 */
export function slotPosition(zoneId: ZoneId, index: number): Vec3 {
  const zone = ZONES[zoneId];
  const cols = Math.max(1, Math.floor(zone.size.width / SLOT_SIZE.width));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: zone.center.x - zone.size.width / 2 + (col + 0.5) * SLOT_SIZE.width,
    y: 0,
    z: zone.center.z - zone.size.depth / 2 + (row + 0.5) * SLOT_SIZE.depth,
  };
}

/** Slots that fit inside a zone's footprint. */
export function zoneCapacity(zoneId: ZoneId): number {
  const { size } = ZONES[zoneId];
  return Math.max(1, Math.floor(size.width / SLOT_SIZE.width)) * Math.max(1, Math.floor(size.depth / SLOT_SIZE.depth));
}

export function dockById(id: DockId): Dock | undefined {
  return DOCKS.find((d) => d.id === id);
}

// ---------------------------------------------------------------------------
// Overflow lot: east of the hub, between the avenue and the south edge. When a
// storage hall is full, its oldest coins park here. They stay in their hall's
// tier (zoneId); only their parking spot moves.

export const OVERFLOW_LOT = {
  minX: 39,
  maxX: 93,
  minZ: -11,
  maxZ: 66,
  /** Centre line of the north–south drive aisle down the middle. */
  aisleX: 66,
  aisleWidth: 6,
} as const;

/**
 * Lot bays face the aisle: trucks drive down the aisle, then turn east or west
 * into a bay, so a bay is a truck's length along x and packed tight along z.
 */
export const LOT_SLOT = { width: 8, depth: 3.2 } as const;

const LOT_COLS_PER_SIDE = Math.floor((OVERFLOW_LOT.aisleX - OVERFLOW_LOT.aisleWidth / 2 - OVERFLOW_LOT.minX) / LOT_SLOT.width);
const LOT_COLS = LOT_COLS_PER_SIDE * 2;

/** Parking spot `index` in the overflow lot: rows north to south, either side of the aisle. Keeps going south past the lot. */
export function lotSlotPosition(index: number): Vec3 {
  const row = Math.floor(index / LOT_COLS);
  const col = index % LOT_COLS;
  const westOfAisle = col < LOT_COLS_PER_SIDE;
  const x = westOfAisle
    ? OVERFLOW_LOT.aisleX - OVERFLOW_LOT.aisleWidth / 2 - (col + 0.5) * LOT_SLOT.width
    : OVERFLOW_LOT.aisleX + OVERFLOW_LOT.aisleWidth / 2 + (col - LOT_COLS_PER_SIDE + 0.5) * LOT_SLOT.width;
  return { x, y: 0, z: OVERFLOW_LOT.minZ + (row + 0.5) * LOT_SLOT.depth };
}

/** Whether a floor point is inside the overflow lot (or its southward spill-over). */
export function inOverflowLot(p: { x: number; z: number }): boolean {
  return p.x >= OVERFLOW_LOT.minX && p.x <= OVERFLOW_LOT.maxX && p.z >= OVERFLOW_LOT.minZ;
}
