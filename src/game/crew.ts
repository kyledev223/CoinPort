/**
 * Launch Bay crew: which forklift unloads which docked truck, and how many
 * crates are on the floor behind each dock. Pure.
 */

import { UNLOAD_MS } from "./constants";
import { DOCKS, dockById } from "./layout";
import { motionEndsAt, sampleMotion, type Motion, type Pose } from "./motion";
import type { DockId, Forklift, ForkliftId, Truck, TruckId, Vec3 } from "./types";

/** Crates in a full trailer. */
export const CRATES_PER_TRUCK = 8;
/** One trip: lift a crate from the trailer, back up, set it down, drive back. */
export const UNLOAD_CYCLE_MS = 4500;
/** Distance between the trailer pickup and the crate drop (m). */
const CARRY_DISTANCE = 4.5;

export interface DockBay {
  dockId: DockId;
  /** Truck holding the dock (docking or unloading). */
  truckId: TruckId | null;
  mint: string | null;
  /** Crates unloaded onto the floor so far. */
  crates: number;
}

export interface UnloadSpots {
  /** Where the forklift stands with its forks in the trailer. */
  pickup: Vec3;
  /** Where it backs up to set a crate down. */
  drop: Vec3;
  /** Centre of the crate stack. */
  stack: Vec3;
}

/** Forklift and crate spots behind a dock door (inside the Launch Bay). */
export function unloadSpots(dockId: DockId): UnloadSpots {
  const dock = dockById(dockId);
  const x = dock?.position.x ?? 0;
  const z = dock?.position.z ?? 0;
  return {
    pickup: { x, y: 0, z: z - 6 },
    drop: { x, y: 0, z: z - 6 - CARRY_DISTANCE },
    stack: { x: x + 1.9, y: 0, z: z - 6 - CARRY_DISTANCE },
  };
}

/**
 * Share of the trailer unloaded, 0–1. Unloading starts once the truck is
 * actually at the dock (`arrivedAt`), and still finishes when the rules say.
 */
export function unloadProgress(truck: Truck, arrivedAt: number, now: number): number {
  if (truck.state !== "unloading") return 0;
  const start = Math.max(truck.stateChangedAt, arrivedAt);
  const end = truck.stateChangedAt + UNLOAD_MS;
  if (now <= start) return 0;
  if (end <= start) return 1;
  return Math.min(1, (now - start) / (end - start));
}

/** Truck holding each dock and the crates behind it. */
export function dockBays(
  trucks: readonly Truck[],
  arrivedAt: (truck: Truck) => number,
  now: number,
): Record<DockId, DockBay> {
  const bays = {} as Record<DockId, DockBay>;
  for (const dock of DOCKS) bays[dock.id] = { dockId: dock.id, truckId: null, mint: null, crates: 0 };
  for (const t of trucks) {
    if (!t.dockId || !bays[t.dockId]) continue;
    bays[t.dockId] = {
      dockId: t.dockId,
      truckId: t.id,
      mint: t.mint,
      crates: Math.floor(CRATES_PER_TRUCK * unloadProgress(t, arrivedAt(t), now)),
    };
  }
  return bays;
}

/** Forklifts based in the Launch Bay unload trucks; the rest work their halls. */
export function isDockCrew(home: Forklift): boolean {
  return home.zoneId === "launch-bay";
}

/**
 * Send crew forklifts to unloading trucks that are at their dock, longest
 * waiting first and nearest forklift first. A forklift keeps its truck until
 * unloading ends, then goes home. Non-crew forklifts stay at home.
 */
export function assignCrew(
  forklifts: readonly Forklift[],
  homes: Readonly<Record<ForkliftId, Forklift>>,
  trucks: readonly Truck[],
  arrivedAt: (truck: Truck) => number,
  now: number,
): Forklift[] {
  const jobs = trucks
    .filter((t) => t.state === "unloading" && t.dockId && arrivedAt(t) <= now)
    .sort((a, b) => a.stateChangedAt - b.stateChangedAt || a.id.localeCompare(b.id));
  const jobIds = new Set(jobs.map((t) => t.id));

  const busy = new Map<ForkliftId, Truck>();
  const served = new Set<TruckId>();
  for (const f of forklifts) {
    if (f.task === "unloading" && f.truckId && jobIds.has(f.truckId) && !served.has(f.truckId)) {
      busy.set(f.id, jobs.find((t) => t.id === f.truckId)!);
      served.add(f.truckId);
    }
  }

  const free = forklifts.filter((f) => isDockCrew(homes[f.id] ?? f) && !busy.has(f.id));
  for (const job of jobs) {
    if (served.has(job.id) || free.length === 0) continue;
    const { pickup } = unloadSpots(job.dockId!);
    free.sort((a, b) => distance(a.position, pickup) - distance(b.position, pickup) || a.id.localeCompare(b.id));
    const f = free.shift()!;
    busy.set(f.id, job);
    served.add(job.id);
  }

  return forklifts.map((f) => {
    const job = busy.get(f.id);
    if (job) {
      const next: Forklift = {
        id: f.id,
        zoneId: "launch-bay",
        position: unloadSpots(job.dockId!).pickup,
        task: "unloading",
        truckId: job.id,
      };
      return sameForklift(f, next) ? f : next;
    }
    const home = homes[f.id] ?? f;
    return sameForklift(f, home) ? f : home;
  });
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function sameForklift(a: Forklift, b: Forklift): boolean {
  return (
    a.task === b.task &&
    a.truckId === b.truckId &&
    a.zoneId === b.zoneId &&
    a.position.x === b.position.x &&
    a.position.z === b.position.z
  );
}

export interface ForkliftPose extends Pose {
  /** Fork height, 0 (floor) to 1 (top). */
  lift: number;
  /** A crate is on the forks. */
  carrying: boolean;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Progress through [a, b] of the cycle, 0–1. */
const span = (u: number, a: number, b: number) => smooth(Math.min(1, Math.max(0, (u - a) / (b - a))));

/**
 * Where a forklift is right now. While unloading it loops trailer → drop →
 * trailer, starting the moment it reaches the trailer; stacking forklifts
 * shuttle in place; otherwise it follows its motion.
 */
export function forkliftPose(forklift: Forklift, motion: Motion, now: number): ForkliftPose {
  const base = sampleMotion(motion, now);
  if (!base.arrived) return { x: base.x, z: base.z, yaw: base.yaw, lift: 0, carrying: false };

  if (forklift.task === "unloading") {
    const u = ((now - motionEndsAt(motion)) % UNLOAD_CYCLE_MS) / UNLOAD_CYCLE_MS;
    // 0–.12 lift at the trailer, .12–.45 back up, .45–.57 lower, .57–.9 drive back, then pause.
    const back = span(u, 0.12, 0.45) - span(u, 0.57, 0.9);
    const lift = span(u, 0, 0.12) - span(u, 0.45, 0.57);
    return {
      x: base.x,
      z: base.z - back * CARRY_DISTANCE,
      yaw: base.yaw,
      lift: 0.15 + lift * 0.35,
      carrying: u < 0.55,
    };
  }

  if (forklift.task === "stacking") {
    const phase = (forklift.position.x * 0.37 + forklift.position.z * 0.11) % (Math.PI * 2);
    const t = (now / 1000) * 0.8 + phase;
    return {
      x: base.x,
      z: base.z + Math.sin(t) * 1.4,
      yaw: base.yaw,
      lift: Math.sin(t * 2) * 0.5 + 0.5,
      carrying: true,
    };
  }

  return { x: base.x, z: base.z, yaw: base.yaw, lift: 0, carrying: false };
}
