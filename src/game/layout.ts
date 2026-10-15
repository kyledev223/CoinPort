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

/** Off-map point departed trucks drive to. */
export const EXIT_POSITION: Vec3 = { x: 85, y: 0, z: -50 };

/** Footprint of one parking slot (a truck plus clearance). */
export const SLOT_SIZE = { width: 4, depth: 8 } as const;

/**
 * Parking spot for the `index`-th truck in a zone, filling rows west to east,
 * north to south. Indices past the footprint keep going south (overflow).
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

export function dockById(id: DockId): Dock | undefined {
  return DOCKS.find((d) => d.id === id);
}
