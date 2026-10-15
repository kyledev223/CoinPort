/**
 * CoinPort game data model.
 *
 * Coins are the only external input. Everything else (trucks, zones, docks,
 * forklifts, activity) is game state derived from coins by the pure rules in
 * `rules.ts`, laid out on the static map in `layout.ts`.
 */

export type Network = "mainnet-beta" | "devnet";

/** A pump.fun token as the game sees it. Source-agnostic: mock and real feeds both produce this. */
export interface Coin {
  /** SPL mint address (base58). Primary key everywhere in the game. */
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  metadataUri: string;
  creatorWallet: string;
  /** Launch time, epoch milliseconds. */
  createdAt: number;
  network: Network;
  marketCapSol: number;
  /** Absent when no SOL/USD price is available yet. */
  marketCapUsd?: number;
  /** Bonding curve completion, 0–1. 1 means the curve is complete and migration is pending or done. */
  curveProgress: number;
  /** True once the coin has migrated off the bonding curve. */
  graduated: boolean;
}

/** Truck lifecycle, in order. A truck never moves backwards through this list. */
export const TRUCK_STATES = [
  "arriving",
  "docking",
  "unloading",
  "stored",
  "hauling",
  "graduated",
  "departed",
] as const;
export type TruckState = (typeof TRUCK_STATES)[number];

export type StorageTier = 1 | 2 | 3;
export type StorageZoneId = "storage-a" | "storage-b" | "storage-c";
export type ZoneId = "entry-gate" | "launch-bay" | "yard" | StorageZoneId | "graduation-gate";
export type ZoneKind = "entry" | "launch-bay" | "yard" | "storage" | "graduation";

export type DockId = `dock-${number}`;
export type TruckId = `truck:${string}`;
export type ForkliftId = `forklift-${number}`;

/** World-space position. Units are metres; y is up, the hub floor is y = 0. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Zone {
  id: ZoneId;
  kind: ZoneKind;
  label: string;
  /** Secondary sign text, e.g. "Discovery" on Tier 1 storage. */
  subtitle?: string;
  /** Set on storage halls only. */
  tier?: StorageTier;
  center: Vec3;
  /** Footprint on the floor plane (x by z). */
  size: { width: number; depth: number };
  /** Docks inside this zone (Launch Bay only). */
  dockIds: DockId[];
}

export interface Dock {
  id: DockId;
  zoneId: "launch-bay";
  /** 1-based number painted on the bay door. */
  number: number;
  /** Where a docked truck parks. */
  position: Vec3;
  /** Yaw in radians a docked truck faces. */
  heading: number;
}

/** One truck per coin. */
export interface Truck {
  id: TruckId;
  mint: string;
  state: TruckState;
  /** null once the truck has departed the hub. */
  zoneId: ZoneId | null;
  /** Held only while docking or unloading. */
  dockId: DockId | null;
  /** Target parking spot; the renderer animates toward it. */
  position: Vec3;
  /** When `state` last changed, epoch milliseconds. */
  stateChangedAt: number;
}

export type ForkliftTask = "idle" | "unloading" | "stacking" | "loading";

export interface Forklift {
  id: ForkliftId;
  zoneId: ZoneId;
  position: Vec3;
  task: ForkliftTask;
  /** Truck being served, if any. */
  truckId: TruckId | null;
}

export type ActivityEventKind =
  | "arrived"
  | "docked"
  | "unloading"
  | "stored"
  | "tier_changed"
  | "hauling"
  | "graduated"
  | "departed";

/** A feed entry. Data only; wording is the UI's job. */
export interface ActivityEvent {
  /** Deterministic: same transition always yields the same id. */
  id: string;
  kind: ActivityEventKind;
  /** Epoch milliseconds. */
  at: number;
  truckId: TruckId;
  mint: string;
  symbol: string;
  zoneId: ZoneId | null;
  dockId: DockId | null;
  /** Storage tier, for `stored` and `tier_changed`. */
  tier?: StorageTier;
  /** Previous tier, for `tier_changed`. */
  fromTier?: StorageTier;
}
