/**
 * Pure rules that turn coin data into truck state, zone, dock and position.
 * No I/O, no clocks: every function takes `now` explicitly.
 *
 * Lifecycle: arriving → docking → unloading → stored → hauling → graduated → departed
 *
 * - Timed steps (arrive, dock, unload, graduation dwell) run off `stateChangedAt`.
 * - Data steps come from the coin: curve complete → hauling, `graduated` → graduated.
 * - Docks are a shared resource, so arriving → docking happens in `assignDocks`.
 * - A truck never moves backwards; the storage hall it sits in follows market cap.
 */

import {
  ARRIVE_MS,
  DOCK_MS,
  GRADUATION_DWELL_MS,
  INTAKE_MS,
  LAUNCH_STATS_WINDOW_MS,
  MIN_HAUL_MS,
  TIER_THRESHOLDS_SOL,
  UNLOAD_MS,
  YARD_MAX_WAIT_MS,
} from "./constants";
import {
  DOCK_IDS,
  EXIT_POSITION,
  STORAGE_ZONE_BY_TIER,
  ZONES,
  dockById,
  lotSlotPosition,
  slotPosition,
  zoneCapacity,
} from "./layout";
import type {
  ActivityEvent,
  ActivityEventKind,
  Coin,
  StorageTier,
  StorageZoneId,
  Truck,
  TruckId,
  TruckState,
  ZoneId,
} from "./types";
import { TRUCK_STATES } from "./types";

// ---------------------------------------------------------------------------
// Coin → tier

/** Clamp to 0–1; non-numbers count as 0. */
export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function tierForMarketCap(marketCapSol: number): StorageTier {
  if (!(marketCapSol >= TIER_THRESHOLDS_SOL.growth)) return 1; // also catches NaN
  return marketCapSol >= TIER_THRESHOLDS_SOL.elite ? 3 : 2;
}

export function storageZoneForCoin(coin: Coin): StorageZoneId {
  return STORAGE_ZONE_BY_TIER[tierForMarketCap(coin.marketCapSol)];
}

export function tierForZone(zoneId: ZoneId | null): StorageTier | undefined {
  return zoneId ? ZONES[zoneId].tier : undefined;
}

/** Curve finished (migration pending) or already migrated. */
export function isCurveComplete(coin: Coin): boolean {
  return coin.graduated || clampProgress(coin.curveProgress) >= 1;
}

// ---------------------------------------------------------------------------
// Truck state machine

export function truckIdForMint(mint: string): TruckId {
  return `truck:${mint}`;
}

export function stateRank(state: TruckState): number {
  return TRUCK_STATES.indexOf(state);
}

export function holdsDock(state: TruckState): boolean {
  return state === "docking" || state === "unloading";
}

/**
 * State for a coin seen for the first time. Fresh launches start arriving
 * (backdated to launch time); coins older than a full intake skip straight
 * to storage so a page load doesn't replay history.
 */
export function initialTruckState(coin: Coin, now: number): { state: TruckState; stateChangedAt: number } {
  if (coin.graduated) return { state: "graduated", stateChangedAt: now };
  if (isCurveComplete(coin)) return { state: "hauling", stateChangedAt: now };
  const launchedAt = Math.min(coin.createdAt, now);
  if (now - launchedAt < INTAKE_MS) return { state: "arriving", stateChangedAt: launchedAt };
  return { state: "stored", stateChangedAt: launchedAt + INTAKE_MS };
}

export interface Transition {
  state: TruckState;
  /** When the transition took effect: the timer's expiry for timed steps, `now` for data-driven ones. */
  at: number;
}

/**
 * The single next transition for a truck, or null if it stays put.
 * Never returns `docking`; that needs a free dock (see `assignDocks`).
 */
export function nextTransition(
  truck: Pick<Truck, "state" | "stateChangedAt">,
  coin: Coin,
  now: number,
): Transition | null {
  const { state, stateChangedAt } = truck;
  const timed = (duration: number, to: TruckState): Transition | null =>
    now - stateChangedAt >= duration ? { state: to, at: stateChangedAt + duration } : null;

  switch (state) {
    case "departed":
      return null;
    case "graduated":
      return timed(GRADUATION_DWELL_MS, "departed");
    case "hauling":
      return coin.graduated && now - stateChangedAt >= MIN_HAUL_MS ? { state: "graduated", at: now } : null;
  }

  // Intake and storage: a completed curve pre-empts everything, freeing any dock.
  if (isCurveComplete(coin)) return { state: "hauling", at: now };

  switch (state) {
    case "arriving":
      return timed(ARRIVE_MS + YARD_MAX_WAIT_MS, "stored");
    case "docking":
      return timed(DOCK_MS, "unloading");
    case "unloading":
      return timed(UNLOAD_MS, "stored");
    case "stored":
      return null;
  }
}

/**
 * Zone a truck belongs in. Arriving trucks sit at the Entry Gate, then queue
 * in the Yard for a dock. Hauling trucks cross the Yard to the Graduation Gate.
 * Without a coin, a stored truck keeps its current hall.
 */
export function zoneForTruck(
  truck: Pick<Truck, "state" | "stateChangedAt" | "zoneId">,
  coin: Coin | undefined,
  now: number,
): ZoneId | null {
  switch (truck.state) {
    case "arriving":
      return now - truck.stateChangedAt < ARRIVE_MS ? "entry-gate" : "yard";
    case "docking":
    case "unloading":
      return "launch-bay";
    case "stored":
      return coin ? storageZoneForCoin(coin) : truck.zoneId;
    case "hauling":
      return "yard";
    case "graduated":
      return "graduation-gate";
    case "departed":
      return null;
  }
}

export function createTruck(coin: Coin, now: number): Truck {
  const { state, stateChangedAt } = initialTruckState(coin, now);
  const zoneId = zoneForTruck({ state, stateChangedAt, zoneId: null }, coin, now);
  return {
    id: truckIdForMint(coin.mint),
    mint: coin.mint,
    state,
    zoneId,
    dockId: null,
    position: zoneId ? slotPosition(zoneId, 0) : EXIT_POSITION,
    stateChangedAt,
  };
}

/**
 * Apply every transition that is due as of `now`, so a long gap between ticks
 * (e.g. a backgrounded tab) catches up instead of advancing one step per tick.
 * Position is left alone; `layoutTrucks` sets it.
 */
export function stepTruck(truck: Truck, coin: Coin, now: number): Truck {
  let next = truck;
  for (let guard = 0; guard < TRUCK_STATES.length; guard++) {
    const t = nextTransition(next, coin, now);
    if (!t || stateRank(t.state) <= stateRank(next.state)) break;
    next = { ...next, state: t.state, stateChangedAt: t.at };
  }
  const dockId = holdsDock(next.state) ? next.dockId : null;
  const zoneId = zoneForTruck(next, coin, now);
  if (next === truck && dockId === truck.dockId && zoneId === truck.zoneId) return truck;
  return { ...next, dockId, zoneId };
}

/**
 * Give free docks to trucks that have cleared the Entry Gate, longest-waiting
 * first. Existing assignments are never moved.
 */
export function assignDocks(trucks: readonly Truck[], now: number): Truck[] {
  const taken = new Set(trucks.filter((t) => holdsDock(t.state) && t.dockId).map((t) => t.dockId));
  const free = DOCK_IDS.filter((id) => !taken.has(id));
  if (free.length === 0) return [...trucks];

  const queue = trucks
    .filter((t) => t.state === "arriving" && now - t.stateChangedAt >= ARRIVE_MS)
    .sort((a, b) => a.stateChangedAt - b.stateChangedAt || a.id.localeCompare(b.id))
    .slice(0, free.length);
  const dockFor = new Map(queue.map((t, i) => [t.id, free[i]]));

  return trucks.map((t) => {
    const dockId = dockFor.get(t.id);
    return dockId
      ? { ...t, state: "docking" as const, stateChangedAt: now, zoneId: "launch-bay" as const, dockId }
      : t;
  });
}

/** How far to look for a truck's current slot index when keeping it in place. */
const MAX_SLOT_SCAN = 4096;

/**
 * Give each truck in `members` a slot from `slotAt`. A truck keeps the slot it
 * already stands in (so one truck leaving doesn't reshuffle the rest); the
 * others take the lowest free slots, longest-waiting first.
 */
function assignSlots(
  members: readonly Truck[],
  slotAt: (index: number) => Truck["position"],
  out: Map<TruckId, Truck["position"]>,
  maxIndex = Infinity,
) {
  const ordered = [...members].sort((a, b) => a.stateChangedAt - b.stateChangedAt || a.id.localeCompare(b.id));
  const taken = new Set<number>();
  const pending: Truck[] = [];
  const slotIndexOf = indexLookup(slotAt, members.length);
  for (const t of ordered) {
    const i = slotIndexOf(t.position);
    if (i !== undefined && i < maxIndex && !taken.has(i)) {
      taken.add(i);
      out.set(t.id, slotAt(i));
    } else {
      pending.push(t);
    }
  }
  let next = 0;
  for (const t of pending) {
    while (taken.has(next)) next++;
    taken.add(next);
    out.set(t.id, slotAt(next));
  }
}

/** Reverse lookup from a position to its slot index, for indices that can still be in use. */
function indexLookup(slotAt: (index: number) => Truck["position"], members: number) {
  const byKey = new Map<string, number>();
  const limit = Math.min(MAX_SLOT_SCAN, members * 2 + 8);
  for (let i = 0; i < limit; i++) {
    const p = slotAt(i);
    byKey.set(`${p.x},${p.z}`, i);
  }
  return (p: Truck["position"]) => byKey.get(`${p.x},${p.z}`);
}

/**
 * Set each truck's target position: its dock if docked, otherwise a parking
 * slot. Storage halls hold at most their footprint's worth of trucks, keeping
 * the newest coins; older ones park in the overflow lot (still in their tier).
 */
export function layoutTrucks(trucks: readonly Truck[], coinByMint?: ReadonlyMap<string, Coin>): Truck[] {
  const byZone = new Map<ZoneId, Truck[]>();
  for (const t of trucks) {
    if (!t.zoneId || t.dockId) continue;
    const list = byZone.get(t.zoneId) ?? [];
    list.push(t);
    byZone.set(t.zoneId, list);
  }

  const positions = new Map<TruckId, Truck["position"]>();
  const overflow: Truck[] = [];
  for (const [zoneId, list] of byZone) {
    if (ZONES[zoneId].kind !== "storage") {
      assignSlots(list, (i) => slotPosition(zoneId, i), positions);
      continue;
    }
    const capacity = zoneCapacity(zoneId);
    const launchedAt = (t: Truck) => coinByMint?.get(t.mint)?.createdAt ?? t.stateChangedAt;
    const newestFirst = [...list].sort((a, b) => launchedAt(b) - launchedAt(a) || a.id.localeCompare(b.id));
    assignSlots(newestFirst.slice(0, capacity), (i) => slotPosition(zoneId, i), positions, capacity);
    overflow.push(...newestFirst.slice(capacity));
  }
  assignSlots(overflow, lotSlotPosition, positions);

  return trucks.map((t) => {
    const dock = t.dockId ? dockById(t.dockId) : undefined;
    const position = dock ? dock.position : t.zoneId ? positions.get(t.id)! : EXIT_POSITION;
    return samePosition(position, t.position) ? t : { ...t, position };
  });
}

function samePosition(a: Truck["position"], b: Truck["position"]): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

// ---------------------------------------------------------------------------
// World tick

export interface AdvanceResult {
  trucks: Truck[];
  events: ActivityEvent[];
}

/**
 * One game tick: ensure one truck per coin, run transitions, hand out
 * docks, lay out positions and report what changed. Trucks whose coin is
 * missing from `coins` are kept as they are.
 */
export function advanceTrucks(coins: readonly Coin[], trucks: readonly Truck[], now: number): AdvanceResult {
  const coinByMint = new Map(coins.map((c) => [c.mint, c]));
  const prevByMint = new Map(trucks.map((t) => [t.mint, t]));

  const stepped: Truck[] = trucks.map((t) => {
    const coin = coinByMint.get(t.mint);
    return coin ? stepTruck(t, coin, now) : t;
  });
  for (const coin of coinByMint.values()) {
    if (!prevByMint.has(coin.mint)) stepped.push(createTruck(coin, now));
  }

  const next = layoutTrucks(assignDocks(stepped, now), coinByMint);
  return { trucks: next, events: diffEvents(prevByMint, next, coinByMint, now) };
}

const EVENT_FOR_STATE: Record<TruckState, ActivityEventKind> = {
  arriving: "arrived",
  docking: "docked",
  unloading: "unloading",
  stored: "stored",
  hauling: "hauling",
  graduated: "graduated",
  departed: "departed",
};

/**
 * Activity events between two tick snapshots: a state change, a stored truck
 * changing hall, or a new truck that is arriving. Trucks first seen mid-life
 * (e.g. on page load) don't emit, so the feed isn't flooded with history.
 */
export function diffEvents(
  prevByMint: ReadonlyMap<string, Truck>,
  next: readonly Truck[],
  coinByMint: ReadonlyMap<string, Coin>,
  now: number,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const truck of next) {
    const prev = prevByMint.get(truck.mint);
    const symbol = coinByMint.get(truck.mint)?.symbol ?? "";
    const base = { truckId: truck.id, mint: truck.mint, symbol, zoneId: truck.zoneId, dockId: truck.dockId };
    const tier = tierForZone(truck.zoneId);

    if (!prev ? truck.state === "arriving" : prev.state !== truck.state) {
      const kind = EVENT_FOR_STATE[truck.state];
      const at = truck.stateChangedAt;
      events.push({ id: `${truck.id}:${kind}:${at}`, kind, at, ...base, ...(kind === "stored" && tier ? { tier } : {}) });
    } else if (prev && truck.state === "stored" && prev.zoneId !== truck.zoneId) {
      const fromTier = tierForZone(prev.zoneId);
      events.push({
        id: `${truck.id}:tier_changed:${now}`,
        kind: "tier_changed",
        at: now,
        ...base,
        ...(tier ? { tier } : {}),
        ...(fromTier ? { fromTier } : {}),
      });
    }
  }
  return events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// HUD

export interface HubSummary {
  coinsLaunchedInWindow: number;
  /** Trucks inside the hub (anything not departed). */
  trucksOnFloor: number;
  graduations: number;
  totalMarketCapSol: number;
  /** Sum over coins that have a USD figure. */
  totalMarketCapUsd: number;
  /** Coins left out of `totalMarketCapUsd`. */
  coinsMissingUsd: number;
}

export function summarizeHub(coins: readonly Coin[], trucks: readonly Truck[], now: number): HubSummary {
  let totalMarketCapSol = 0;
  let totalMarketCapUsd = 0;
  let coinsMissingUsd = 0;
  for (const c of coins) {
    totalMarketCapSol += Number.isFinite(c.marketCapSol) ? c.marketCapSol : 0;
    if (c.marketCapUsd === undefined || !Number.isFinite(c.marketCapUsd)) coinsMissingUsd++;
    else totalMarketCapUsd += c.marketCapUsd;
  }
  return {
    coinsLaunchedInWindow: coins.filter((c) => c.createdAt <= now && now - c.createdAt < LAUNCH_STATS_WINDOW_MS).length,
    trucksOnFloor: trucks.filter((t) => t.state !== "departed").length,
    graduations: coins.filter((c) => c.graduated).length,
    totalMarketCapSol,
    totalMarketCapUsd,
    coinsMissingUsd,
  };
}
