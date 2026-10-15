/**
 * One tick of the whole hub: coin data → truck rules → movement plans →
 * crew and docks. Pure; the store calls it on a timer and the scene only
 * samples what it returns.
 */

import { assignCrew, dockBays, forkliftPose, type DockBay } from "./crew";
import { dockById } from "./layout";
import { planMotion, motionEndsAt, sampleMotion, stationaryMotion, timeCrossingZ, type Motion } from "./motion";
import { GRADUATION_ARCH_Z, SPAWN_POINT, routeBetween } from "./roads";
import { advanceTrucks } from "./rules";
import type { ActivityEvent, Coin, DockId, Forklift, ForkliftId, Truck, TruckId, TruckState } from "./types";

export const TRUCK_SPEED = 14; // m/s
export const FORKLIFT_SPEED = 5; // m/s
/** Parked trucks face south (toward the camera) unless they drove in another way. */
export const PARKED_YAW = Math.PI;
const MAX_EVENTS = 50;
/** Gate flashes older than this are dropped. */
const FLASH_KEEP_MS = 10_000;

export type TruckHistory = Partial<Record<TruckState, number>>;

export interface World {
  /** False until the first step; trucks seen then are placed, later ones drive in. */
  booted: boolean;
  now: number;
  trucks: Truck[];
  motions: Record<TruckId, Motion>;
  /** When each truck entered each state it has been seen in. */
  history: Record<TruckId, TruckHistory>;
  forklifts: Forklift[];
  forkliftHomes: Record<ForkliftId, Forklift>;
  forkliftMotions: Record<ForkliftId, Motion>;
  bays: Record<DockId, DockBay>;
  /** Mints whose truck has left the hub; never recreated. */
  retired: Record<string, true>;
  /** Times a departing truck passes under the Graduation Gate. */
  gateFlashes: number[];
  /** Newest last. */
  events: ActivityEvent[];
}

export function createWorld(forklifts: readonly Forklift[], now: number): World {
  const forkliftHomes = Object.fromEntries(forklifts.map((f) => [f.id, f])) as Record<ForkliftId, Forklift>;
  const forkliftMotions = Object.fromEntries(
    forklifts.map((f) => [f.id, stationaryMotion({ x: f.position.x, z: f.position.z, yaw: PARKED_YAW }, now, forkliftKey(f))]),
  ) as Record<ForkliftId, Motion>;
  return {
    booted: false,
    now,
    trucks: [],
    motions: {},
    history: {},
    forklifts: [...forklifts],
    forkliftHomes,
    forkliftMotions,
    bays: dockBays([], () => now, now),
    retired: {},
    gateFlashes: [],
    events: [],
  };
}

function truckKey(t: Truck): string {
  return `${t.position.x},${t.position.z},${t.dockId ?? "-"},${t.state === "departed" ? "out" : "in"}`;
}

function forkliftKey(f: Forklift): string {
  return `${f.position.x},${f.position.z}`;
}

function restingYaw(t: Truck): number {
  return t.dockId ? (dockById(t.dockId)?.heading ?? PARKED_YAW) : PARKED_YAW;
}

export function stepWorld(world: World, coins: Readonly<Record<string, Coin>>, now: number): World {
  const live = Object.values(coins).filter((c) => !world.retired[c.mint]);
  const { trucks: advanced, events } = advanceTrucks(live, world.trucks, now);

  // Movement: plan a new drive whenever a truck's target changes.
  const motions: Record<TruckId, Motion> = {};
  const gateFlashes = world.gateFlashes.filter((t) => t > now - FLASH_KEEP_MS);
  for (const t of advanced) {
    const key = truckKey(t);
    const prev = world.motions[t.id];
    if (prev && prev.targetKey === key) {
      motions[t.id] = prev;
      continue;
    }
    const target = { x: t.position.x, z: t.position.z };
    if (!prev && !world.booted) {
      motions[t.id] = stationaryMotion({ ...target, yaw: restingYaw(t) }, now, key);
      continue;
    }
    const from = prev ? sampleMotion(prev, now) : { ...SPAWN_POINT, yaw: 0 };
    const m = planMotion(from, routeBetween(from, target, t), { now, speed: TRUCK_SPEED, targetKey: key });
    motions[t.id] = m;
    if (t.state === "departed") {
      const crossing = timeCrossingZ(m, GRADUATION_ARCH_Z);
      if (crossing !== null) gateFlashes.push(crossing);
    }
  }

  // Departed trucks that have reached the exit leave the game.
  const retired = { ...world.retired };
  const trucks = advanced.filter((t) => {
    if (t.state !== "departed" || motionEndsAt(motions[t.id]) > now) return true;
    retired[t.mint] = true;
    delete motions[t.id];
    return false;
  });

  const history: Record<TruckId, TruckHistory> = {};
  for (const t of trucks) history[t.id] = world.history[t.id] ?? { [t.state]: t.stateChangedAt };
  for (const e of events) {
    const state = EVENT_STATE[e.kind];
    if (state && history[e.truckId]) history[e.truckId] = { ...history[e.truckId], [state]: e.at };
  }

  const arrivedAt = (t: Truck) => motionEndsAt(motions[t.id]);
  const forklifts = assignCrew(world.forklifts, world.forkliftHomes, trucks, arrivedAt, now);
  const forkliftMotions: Record<ForkliftId, Motion> = {};
  forklifts.forEach((f, i) => {
    const prev = world.forkliftMotions[f.id];
    const key = forkliftKey(f);
    if (prev && prev.targetKey === key) {
      forkliftMotions[f.id] = prev;
      return;
    }
    // Leave from wherever the work cycle has it, not from the cycle's anchor.
    const before = world.forklifts[i]?.id === f.id ? world.forklifts[i] : f;
    const from = prev ? forkliftPose(before, prev, now) : { x: f.position.x, z: f.position.z, yaw: PARKED_YAW };
    forkliftMotions[f.id] = planMotion(from, [{ x: f.position.x, z: f.position.z }], {
      now,
      speed: FORKLIFT_SPEED,
      targetKey: key,
      restYaw: PARKED_YAW,
    });
  });

  return {
    booted: true,
    now,
    trucks,
    motions,
    history,
    forklifts,
    forkliftHomes: world.forkliftHomes,
    forkliftMotions,
    bays: dockBays(trucks, arrivedAt, now),
    retired,
    gateFlashes,
    events: events.length ? [...world.events, ...events].slice(-MAX_EVENTS) : world.events,
  };
}

const EVENT_STATE: Partial<Record<ActivityEvent["kind"], TruckState>> = {
  arrived: "arriving",
  docked: "docking",
  unloading: "unloading",
  stored: "stored",
  hauling: "hauling",
  graduated: "graduated",
  departed: "departed",
};
