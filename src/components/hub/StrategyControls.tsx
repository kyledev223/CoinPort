import { MapControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MOUSE, Plane, Raycaster, TOUCH, Vector2, Vector3 } from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { sampleMotion } from "@/game";
import { cameraView } from "@/store/cameraView";
import { useGameStore } from "@/store/gameStore";

/** Fixed isometric-style viewing angle: tilt from vertical and yaw around the hub. */
export const CAMERA_POLAR = 0.86;
export const CAMERA_AZIMUTH = 0.42;
export const CAMERA_START_DISTANCE = 125;
export const CAMERA_TARGET: [number, number, number] = [-2, 0, -6];

/** The camera's look-at point stays inside this box, so the hub never leaves the screen. */
export const PAN_BOUNDS = { minX: -70, maxX: 75, minZ: -55, maxZ: 40 };
const MIN_DISTANCE = 30;
const MAX_DISTANCE = 190;
/** Pointer travel (px) that counts as the user panning, which ends Follow and glides. */
const PAN_CANCEL_PX = 6;
/** How quickly the camera catches up with a followed truck (1/s). */
const FOLLOW_RATE = 5;
const FLIGHT_MS = 900;

/** Unit vector from the look-at point to the camera. */
const VIEW_DIR = new Vector3(
  Math.sin(CAMERA_POLAR) * Math.sin(CAMERA_AZIMUTH),
  Math.cos(CAMERA_POLAR),
  Math.sin(CAMERA_POLAR) * Math.cos(CAMERA_AZIMUTH),
);

export function cameraStartPosition(): [number, number, number] {
  const [tx, ty, tz] = CAMERA_TARGET;
  const d = CAMERA_START_DISTANCE;
  return [tx + d * VIEW_DIR.x, ty + d * VIEW_DIR.y, tz + d * VIEW_DIR.z];
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Flight {
  from: { x: number; z: number; d: number };
  to: { x: number; z: number; d: number };
  start: number;
}

const floor = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const corner = new Vector2();
const hit = new Vector3();
const CORNERS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * Strategy-game camera: drag to pan across the floor, wheel to zoom toward
 * the cursor, one-finger pan and two-finger pinch/pan on touch. No rotation.
 * Glides to the store's camera requests and follows `followTruckId`; any
 * drag hands control back to the user.
 */
export function StrategyControls() {
  const controls = useRef<MapControlsImpl>(null);
  const flight = useRef<Flight | null>(null);
  const lastNonce = useRef(0);
  const domElement = useThree((s) => s.gl.domElement);

  /** Put the look-at point at (x, z) and the camera `d` metres back along the fixed view angle. */
  const setView = (x: number, z: number, d: number) => {
    const c = controls.current;
    if (!c) return;
    c.target.set(clamp(x, PAN_BOUNDS.minX, PAN_BOUNDS.maxX), 0, clamp(z, PAN_BOUNDS.minZ, PAN_BOUNDS.maxZ));
    c.object.position.copy(c.target).addScaledVector(VIEW_DIR, clamp(d, MIN_DISTANCE, MAX_DISTANCE));
  };

  const keepInBounds = () => {
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    const dx = clamp(t.x, PAN_BOUNDS.minX, PAN_BOUNDS.maxX) - t.x;
    const dz = clamp(t.z, PAN_BOUNDS.minZ, PAN_BOUNDS.maxZ) - t.z;
    const dy = -t.y;
    if (dx === 0 && dy === 0 && dz === 0) return;
    t.set(t.x + dx, 0, t.z + dz);
    c.object.position.set(c.object.position.x + dx, c.object.position.y + dy, c.object.position.z + dz);
  };

  // A drag (mouse or touch) cancels glides and Follow; wheel zoom does not.
  useEffect(() => {
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = () => (down = null);
    const onMove = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) < PAN_CANCEL_PX) return;
      flight.current = null;
      useGameStore.getState().userPanned();
    };
    domElement.addEventListener("pointerdown", onDown);
    domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      domElement.removeEventListener("pointerdown", onDown);
      domElement.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [domElement]);

  useFrame(({ camera }, delta) => {
    const c = controls.current;
    if (!c) return;
    const { cameraRequest, followTruckId, world } = useGameStore.getState();
    const now = performance.now();
    const distance = c.object.position.distanceTo(c.target);

    if (cameraRequest && cameraRequest.nonce !== lastNonce.current) {
      lastNonce.current = cameraRequest.nonce;
      flight.current = {
        from: { x: c.target.x, z: c.target.z, d: distance },
        to: { x: cameraRequest.x, z: cameraRequest.z, d: cameraRequest.distance ?? distance },
        start: now,
      };
    }

    const f = flight.current;
    if (f) {
      const t = Math.min(1, (now - f.start) / FLIGHT_MS);
      const e = easeInOutCubic(t);
      // While following, aim the glide at where the truck is now, not where it was.
      const motion = followTruckId ? world.motions[followTruckId] : undefined;
      const to = motion ? { ...f.to, ...pick(sampleMotion(motion, Date.now())) } : f.to;
      setView(f.from.x + (to.x - f.from.x) * e, f.from.z + (to.z - f.from.z) * e, f.from.d + (to.d - f.from.d) * e);
      if (t >= 1) flight.current = null;
    } else {
      const motion = followTruckId ? world.motions[followTruckId] : undefined;
      if (motion) {
        const pose = sampleMotion(motion, Date.now());
        const k = 1 - Math.exp(-FOLLOW_RATE * Math.min(delta, 0.1));
        setView(c.target.x + (pose.x - c.target.x) * k, c.target.z + (pose.z - c.target.z) * k, distance);
      }
    }

    // Publish what's on screen for the minimap.
    cameraView.target.x = c.target.x;
    cameraView.target.z = c.target.z;
    cameraView.footprint = [];
    for (const [nx, ny] of CORNERS) {
      raycaster.setFromCamera(corner.set(nx, ny), camera);
      if (raycaster.ray.intersectPlane(floor, hit)) cameraView.footprint.push({ x: hit.x, z: hit.z });
    }
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      target={CAMERA_TARGET}
      enableRotate={false}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      zoomToCursor
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={CAMERA_POLAR}
      maxPolarAngle={CAMERA_POLAR}
      minAzimuthAngle={CAMERA_AZIMUTH}
      maxAzimuthAngle={CAMERA_AZIMUTH}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
      onChange={keepInBounds}
    />
  );
}

function pick(p: { x: number; z: number }) {
  return { x: p.x, z: p.z };
}
