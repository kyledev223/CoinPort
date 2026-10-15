/**
 * Time-based movement along waypoint paths. A Motion is planned once (when a
 * target changes) and sampled every frame, so movement is smooth, steady and
 * fully determined by (motion, time). Pure; no frame loop in here.
 *
 * Yaw convention: 0 faces north (-z); a model's nose points along local -z.
 */

import type { Waypoint } from "./roads";

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

export interface Motion {
  /** Path points; points[0] is where the motion starts. */
  points: ReadonlyArray<{ x: number; z: number }>;
  /** Per segment (points[i] → points[i+1]): driven in reverse. */
  reverse: readonly boolean[];
  /** Distance travelled when reaching points[i]. */
  cumulative: readonly number[];
  startYaw: number;
  /** Heading held after arrival; null keeps the last segment's heading. */
  restYaw: number | null;
  startedAt: number;
  /** Metres per second. */
  speed: number;
  /** Identifies the target this motion was planned for, so it's not replanned needlessly. */
  targetKey: string;
}

/** How far before and after a corner the heading blends (m). */
const TURN_RADIUS = 3;
/** Distance over which a truck swings from its parked heading onto the first leg (m). */
const PULL_OUT = 4;

export function yawToward(dx: number, dz: number, reverse = false): number {
  const yaw = Math.atan2(-dx, -dz);
  return reverse ? yaw + Math.PI : yaw;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

/** A motion that stays put. */
export function stationaryMotion(pose: Pose, now: number, targetKey: string): Motion {
  return {
    points: [{ x: pose.x, z: pose.z }],
    reverse: [],
    cumulative: [0],
    startYaw: pose.yaw,
    restYaw: pose.yaw,
    startedAt: now,
    speed: 1,
    targetKey,
  };
}

/** Plan a drive from `from` through `waypoints` at constant `speed`. */
export function planMotion(
  from: Pose,
  waypoints: readonly Waypoint[],
  options: { now: number; speed: number; targetKey: string; restYaw?: number | null },
): Motion {
  const points = [{ x: from.x, z: from.z }];
  const reverse: boolean[] = [];
  for (const wp of waypoints) {
    const last = points[points.length - 1];
    if (Math.hypot(wp.x - last.x, wp.z - last.z) < 1e-3) continue;
    points.push({ x: wp.x, z: wp.z });
    reverse.push(wp.reverse ?? false);
  }
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  return {
    points,
    reverse,
    cumulative,
    startYaw: from.yaw,
    restYaw: options.restYaw ?? null,
    startedAt: options.now,
    speed: options.speed,
    targetKey: options.targetKey,
  };
}

export function motionLength(m: Motion): number {
  return m.cumulative[m.cumulative.length - 1];
}

/** When the motion reaches its last point (epoch ms). */
export function motionEndsAt(m: Motion): number {
  return m.startedAt + (motionLength(m) / m.speed) * 1000;
}

function segmentYaw(m: Motion, i: number): number {
  const a = m.points[i];
  const b = m.points[i + 1];
  return yawToward(b.x - a.x, b.z - a.z, m.reverse[i]);
}

/** Pose at time `now`: position along the path, heading blended through corners. */
export function sampleMotion(m: Motion, now: number): Pose & { arrived: boolean } {
  const segments = m.points.length - 1;
  const total = motionLength(m);
  const s = Math.max(0, ((now - m.startedAt) / 1000) * m.speed);

  if (segments === 0 || s >= total) {
    const end = m.points[m.points.length - 1];
    const yaw = m.restYaw ?? (segments === 0 ? m.startYaw : segmentYaw(m, segments - 1));
    return { x: end.x, z: end.z, yaw, arrived: true };
  }

  let i = 0;
  while (i < segments - 1 && m.cumulative[i + 1] <= s) i++;
  const length = m.cumulative[i + 1] - m.cumulative[i];
  const t = s - m.cumulative[i];
  const a = m.points[i];
  const b = m.points[i + 1];
  const x = a.x + ((b.x - a.x) * t) / length;
  const z = a.z + ((b.z - a.z) * t) / length;

  const here = segmentYaw(m, i);
  let yaw = here;
  if (i === 0) {
    const r = Math.min(PULL_OUT, length);
    if (t < r) yaw = lerpAngle(m.startYaw, here, t / r);
  } else {
    const prevLength = m.cumulative[i] - m.cumulative[i - 1];
    const r = Math.min(TURN_RADIUS, length / 2, prevLength / 2);
    if (t < r) yaw = lerpAngle(segmentYaw(m, i - 1), here, 0.5 + t / (2 * r));
  }
  if (i < segments - 1) {
    const nextLength = m.cumulative[i + 2] - m.cumulative[i + 1];
    const r = Math.min(TURN_RADIUS, length / 2, nextLength / 2);
    const left = length - t;
    if (left < r) yaw = lerpAngle(here, segmentYaw(m, i + 1), 0.5 - left / (2 * r));
  }
  return { x, z, yaw, arrived: false };
}

/** Time the path first crosses the line z = `lineZ`, or null if it never does. */
export function timeCrossingZ(m: Motion, lineZ: number): number | null {
  for (let i = 0; i < m.points.length - 1; i++) {
    const a = m.points[i];
    const b = m.points[i + 1];
    if (a.z === b.z || (a.z - lineZ) * (b.z - lineZ) > 0) continue;
    const length = m.cumulative[i + 1] - m.cumulative[i];
    const s = m.cumulative[i] + (length * (a.z - lineZ)) / (a.z - b.z);
    return m.startedAt + (s / m.speed) * 1000;
  }
  return null;
}
