/**
 * Road graph trucks drive along between zones, so they never cut through
 * buildings. The rules decide where a truck should be; this decides how it
 * gets there.
 */

import { DOCKS, EXIT_POSITION, ZONES } from "./layout";
import type { DockId, ZoneId } from "./types";

export interface Waypoint {
  x: number;
  z: number;
  /** Drive this leg backwards (backing into a dock). */
  reverse?: boolean;
}

/** East–west avenue between the storage halls and the Yard / Launch Bay. */
export const AVENUE_Z = -17;
/** Apron road in front of the dock doors. */
export const APRON_Z = 33;
/** North–south lane between the Yard and the Launch Bay. */
export const LANE_X = -8;

const entryZone = ZONES["entry-gate"];
const gradZone = ZONES["graduation-gate"];

/** The Entry Gate arch spans the zone's south edge; arriving trucks drive north through it. */
export const ENTRY_ARCH_Z = entryZone.center.z + entryZone.size.depth / 2 + 1;
/** The Graduation Gate arch spans the zone's north edge; departing trucks drive north through it. */
export const GRADUATION_ARCH_Z = gradZone.center.z - gradZone.size.depth / 2 - 1;
/** Where new trucks appear, off the south edge of the map below the Entry Gate. */
export const SPAWN_POINT: Waypoint = { x: entryZone.center.x, z: 85 };

const nodes: Record<string, Waypoint> = {
  spawn: SPAWN_POINT,
  entry: { x: entryZone.center.x, z: entryZone.center.z },
  yard: { x: ZONES.yard.center.x, z: ZONES.yard.center.z },
  laneSouth: { x: LANE_X, z: APRON_Z },
  laneNorth: { x: LANE_X, z: AVENUE_Z },
  avA: { x: ZONES["storage-a"].center.x, z: AVENUE_Z },
  avB: { x: ZONES["storage-b"].center.x, z: AVENUE_Z },
  avC: { x: ZONES["storage-c"].center.x, z: AVENUE_Z },
  avGrad: { x: gradZone.center.x, z: AVENUE_Z },
  gradGate: { x: gradZone.center.x, z: gradZone.center.z - 3 },
  gradOut: { x: gradZone.center.x, z: GRADUATION_ARCH_Z - 12 },
  exit: { x: EXIT_POSITION.x, z: EXIT_POSITION.z },
};

const edges: Array<[string, string]> = [
  ["spawn", "entry"],
  ["entry", "yard"],
  ["yard", "laneSouth"],
  ["yard", "laneNorth"],
  ["laneSouth", "laneNorth"],
  ["avA", "avB"],
  ["avB", "laneNorth"],
  ["laneNorth", "avC"],
  ["avC", "avGrad"],
  ["avGrad", "gradGate"],
  ["gradGate", "gradOut"],
  ["gradOut", "exit"],
];

for (const dock of DOCKS) {
  const id = `apron:${dock.id}`;
  nodes[id] = { x: dock.position.x, z: APRON_Z };
  edges.push(["laneSouth", id]);
}

/** Road centre lines, for drawing. */
export const ROAD_SEGMENTS: ReadonlyArray<readonly [Waypoint, Waypoint]> = edges.map(([a, b]) => [nodes[a], nodes[b]] as const);

const adjacency = new Map<string, Array<{ to: string; cost: number }>>();
for (const [a, b] of edges) {
  const cost = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
  adjacency.set(a, [...(adjacency.get(a) ?? []), { to: b, cost }]);
  adjacency.set(b, [...(adjacency.get(b) ?? []), { to: a, cost }]);
}

function nearestNode(p: Waypoint): string {
  let best = "";
  let bestDistance = Infinity;
  for (const [id, n] of Object.entries(nodes)) {
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

function shortestPath(from: string, to: string): string[] {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size > 0) {
    let current = "";
    let currentDist = Infinity;
    for (const id of open) {
      const d = dist.get(id) ?? Infinity;
      if (d < currentDist) {
        current = id;
        currentDist = d;
      }
    }
    open.delete(current);
    if (current === to) break;
    for (const { to: next, cost } of adjacency.get(current) ?? []) {
      const d = currentDist + cost;
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, current);
        open.add(next);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]);
    if (!p) return [to];
    path.unshift(p);
  }
  return path;
}

const ACCESS_NODE: Record<ZoneId, string> = {
  "entry-gate": "entry",
  yard: "yard",
  "launch-bay": "laneSouth",
  "storage-a": "avA",
  "storage-b": "avB",
  "storage-c": "avC",
  "graduation-gate": "avGrad",
};

/** Road node a truck uses to reach a zone (its dock's apron when docked, the exit when departed). */
function accessNode(zoneId: ZoneId | null, dockId: DockId | null): string {
  if (dockId) return `apron:${dockId}`;
  return zoneId ? ACCESS_NODE[zoneId] : "exit";
}

function insideZone(p: Waypoint, zoneId: ZoneId): boolean {
  const { center, size } = ZONES[zoneId];
  return Math.abs(p.x - center.x) <= size.width / 2 && Math.abs(p.z - center.z) <= size.depth / 2;
}

/**
 * Waypoints from `from` to a truck's target spot, ending exactly at `to`.
 * Reshuffles inside one zone go straight; docks are backed into.
 */
export function routeBetween(
  from: Waypoint,
  to: Waypoint,
  target: { zoneId: ZoneId | null; dockId: DockId | null },
): Waypoint[] {
  const last: Waypoint = { x: to.x, z: to.z, reverse: target.dockId !== null };
  if (!target.dockId && target.zoneId && insideZone(from, target.zoneId)) return [last];
  const start = nearestNode(from);
  const end = accessNode(target.zoneId, target.dockId);
  const via = start === end ? [nodes[end]] : shortestPath(start, end).map((id) => nodes[id]);
  return [...via.map(({ x, z }) => ({ x, z })), last];
}
