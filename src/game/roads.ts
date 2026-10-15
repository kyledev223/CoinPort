/**
 * Road graph trucks drive along between zones, so they never cut through
 * buildings. Every road runs straight north–south or east–west, and every
 * trip is made of straight legs at right angles: a truck backs straight out of
 * its bay, follows the roads, then turns straight into its new bay. The rules
 * decide where a truck should be; this decides how it gets there.
 */

import { DOCKS, EXIT_POSITION, OVERFLOW_LOT, ZONES, inOverflowLot } from "./layout";
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

/** Entry road: east from the Entry Gate along the aisle between its two rows of bays. */
export const ENTRY_ROAD_Z = entryZone.center.z;
/** The Entry Gate arch spans the zone's south edge; arriving trucks drive north through it. */
export const ENTRY_ARCH_Z = entryZone.center.z + entryZone.size.depth / 2 + 1;
/** The Graduation Gate arch spans the zone's north edge; departing trucks drive north through it. */
export const GRADUATION_ARCH_Z = gradZone.center.z - gradZone.size.depth / 2 - 1;
/** Where new trucks appear: on the city's south ring road, below the Entry Gate. */
export const SPAWN_POINT: Waypoint = { x: entryZone.center.x, z: 87 };

const nodes: Record<string, Waypoint> = {
  spawn: SPAWN_POINT,
  entry: { x: entryZone.center.x, z: ENTRY_ROAD_Z },
  laneEntry: { x: LANE_X, z: ENTRY_ROAD_Z },
  laneSouth: { x: LANE_X, z: APRON_Z },
  yardGate: { x: LANE_X, z: ZONES.yard.center.z },
  laneNorth: { x: LANE_X, z: AVENUE_Z },
  avA: { x: ZONES["storage-a"].center.x, z: AVENUE_Z },
  avB: { x: ZONES["storage-b"].center.x, z: AVENUE_Z },
  avC: { x: ZONES["storage-c"].center.x, z: AVENUE_Z },
  avGrad: { x: gradZone.center.x, z: AVENUE_Z },
  gradGate: { x: gradZone.center.x, z: gradZone.center.z - 3 },
  gradOut: { x: gradZone.center.x, z: EXIT_POSITION.z },
  exit: { x: EXIT_POSITION.x, z: EXIT_POSITION.z },
  // Overflow lot: gate on the avenue, aisle running south through the lot.
  lot: { x: OVERFLOW_LOT.aisleX, z: AVENUE_Z },
  lotEnd: { x: OVERFLOW_LOT.aisleX, z: OVERFLOW_LOT.maxZ },
};

const edges: Array<[string, string]> = [
  ["spawn", "entry"],
  ["entry", "laneEntry"],
  ["laneSouth", "laneEntry"],
  ["laneEntry", "yardGate"],
  ["yardGate", "laneNorth"],
  ["avA", "avB"],
  ["avB", "laneNorth"],
  ["laneNorth", "avC"],
  ["avC", "avGrad"],
  ["avGrad", "lot"],
  ["avGrad", "gradGate"],
  ["gradGate", "gradOut"],
  ["gradOut", "exit"],
  ["lot", "lotEnd"],
];

for (const dock of DOCKS) {
  const id = `apron:${dock.id}`;
  nodes[id] = { x: dock.position.x, z: APRON_Z };
  edges.push(["laneSouth", id]);
}

/** Road centre lines, for drawing. */
export const ROAD_SEGMENTS: ReadonlyArray<readonly [Waypoint, Waypoint]> = edges.map(([a, b]) => [nodes[a], nodes[b]] as const);

// All-pairs shortest paths over the (small) graph, computed once.
const ids = Object.keys(nodes);
const index = new Map(ids.map((id, i) => [id, i]));
const dist = ids.map((a) => ids.map((b) => (a === b ? 0 : Infinity)));
const next = ids.map((_, i) => ids.map((__, j) => (i === j ? j : -1)));
for (const [a, b] of edges) {
  const i = index.get(a)!;
  const j = index.get(b)!;
  const d = Math.abs(nodes[a].x - nodes[b].x) + Math.abs(nodes[a].z - nodes[b].z);
  dist[i][j] = dist[j][i] = d;
  next[i][j] = j;
  next[j][i] = i;
}
for (let k = 0; k < ids.length; k++)
  for (let i = 0; i < ids.length; i++)
    for (let j = 0; j < ids.length; j++)
      if (dist[i][k] + dist[k][j] < dist[i][j]) {
        dist[i][j] = dist[i][k] + dist[k][j];
        next[i][j] = next[i][k];
      }

function path(from: string, to: string): Waypoint[] {
  let i = index.get(from)!;
  const j = index.get(to)!;
  const out = [nodes[from]];
  while (i !== j) {
    i = next[i][j];
    if (i < 0) break;
    out.push(nodes[ids[i]]);
  }
  return out;
}

const manhattan = (a: Waypoint, b: Waypoint) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/** Straight legs from `a` to `b`: one leg if they share an axis, otherwise two at a right angle. */
function rightAngle(a: Waypoint, b: Waypoint, verticalFirst: boolean): Waypoint[] {
  const end = { x: b.x, z: b.z };
  if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.z - b.z) < 1e-6) return [end];
  return [verticalFirst ? { x: a.x, z: b.z } : { x: b.x, z: a.z }, end];
}

const AVENUE_NODES = ["avA", "avB", "laneNorth", "avC", "avGrad", "lot"];

/** Road nodes a zone is reached from (and left by). */
const ZONE_NODES: Record<ZoneId, string[]> = {
  "entry-gate": ["entry"],
  yard: ["yardGate", "laneEntry", "laneNorth"],
  "launch-bay": ["laneSouth"],
  "storage-a": AVENUE_NODES,
  "storage-b": AVENUE_NODES,
  "storage-c": AVENUE_NODES,
  "graduation-gate": [...AVENUE_NODES, "gradGate"],
};

function zoneAt(p: Waypoint): ZoneId | null {
  for (const [id, z] of Object.entries(ZONES) as Array<[ZoneId, (typeof ZONES)[ZoneId]]>) {
    if (Math.abs(p.x - z.center.x) <= z.size.width / 2 && Math.abs(p.z - z.center.z) <= z.size.depth / 2) return id;
  }
  return null;
}

function dockAt(p: Waypoint): DockId | null {
  return DOCKS.find((d) => Math.abs(d.position.x - p.x) < 0.5 && Math.abs(d.position.z - p.z) < 0.5)?.id ?? null;
}

/** Road nodes usable to leave `p`: its dock's apron, its zone's nodes, or (mid-road) any node. */
function departureNodes(p: Waypoint): string[] {
  const dock = dockAt(p);
  if (dock) return [`apron:${dock}`];
  const zone = zoneAt(p);
  return zone ? ZONE_NODES[zone] : ids.filter((id) => id !== "lotEnd");
}

/** Road nodes usable to reach a target: its dock's apron, the exit, or its zone's nodes. */
function arrivalNodes(target: { zoneId: ZoneId | null; dockId: DockId | null }): string[] {
  if (target.dockId) return [`apron:${target.dockId}`];
  return target.zoneId ? ZONE_NODES[target.zoneId] : ["exit"];
}

/**
 * Waypoints from `from` to a truck's target spot, ending exactly at `to`. All
 * legs are straight and axis-aligned. Bays are entered head-on (north/south in
 * zones, east/west in the overflow lot); docks are backed into.
 */
export function routeBetween(
  from: Waypoint,
  to: Waypoint,
  target: { zoneId: ZoneId | null; dockId: DockId | null },
): Waypoint[] {
  const last: Waypoint = { x: to.x, z: to.z, reverse: target.dockId !== null };
  const fromLot = inOverflowLot(from);
  const toLot = inOverflowLot(to);
  const aisle = (z: number): Waypoint => ({ x: OVERFLOW_LOT.aisleX, z });

  // Inside the lot: out to the aisle, along it, into the new bay.
  if (fromLot && toLot) return straighten(from, [aisle(from.z), aisle(to.z), last]);

  // Pick the entry and exit road nodes that make the whole trip shortest, so
  // trucks don't double back along a road.
  const starts = fromLot ? ["lot"] : departureNodes(from);
  const ends = toLot ? ["lot"] : arrivalNodes(target);
  const leaveCost = (s: string) => (fromLot ? manhattan(from, aisle(from.z)) + manhattan(aisle(from.z), nodes.lot) : manhattan(from, nodes[s]));
  const arriveCost = (e: string) => (toLot ? manhattan(nodes.lot, aisle(to.z)) + manhattan(aisle(to.z), to) : manhattan(nodes[e], to));
  let best = { s: starts[0], e: ends[0], cost: Infinity };
  for (const s of starts) {
    for (const e of ends) {
      const cost = leaveCost(s) + dist[index.get(s)!][index.get(e)!] + arriveCost(e);
      if (cost < best.cost) best = { s, e, cost };
    }
  }

  const route = path(best.s, best.e);
  const out: Waypoint[] = [];
  // Leave: out of a lot bay to the aisle, or straight out of a zone bay first.
  if (fromLot) out.push(aisle(from.z), route[0]);
  else out.push(...rightAngle(from, route[0], true));
  for (const node of route.slice(1)) out.push({ x: node.x, z: node.z });
  // Arrive: along the road first, then straight into the bay.
  const lastNode = route[route.length - 1];
  if (toLot) out.push(aisle(to.z), last);
  else out.push(...rightAngle(lastNode, to, false).slice(0, -1), last);
  return straighten(from, out);
}

/**
 * Drop waypoints that sit on a straight line with their neighbours, e.g. a
 * road node a truck would otherwise drive past and back to. Every leg stays
 * axis-aligned; the final waypoint (and its reverse flag) is always kept.
 */
function straighten(from: Waypoint, route: Waypoint[]): Waypoint[] {
  const pts = [from, ...route];
  for (let i = 1; i < pts.length - 1; ) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const sameX = Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - c.x) < 1e-6;
    const sameZ = Math.abs(a.z - b.z) < 1e-6 && Math.abs(b.z - c.z) < 1e-6;
    if (sameX || sameZ) pts.splice(i, 1);
    else i++;
  }
  return pts.slice(1);
}
