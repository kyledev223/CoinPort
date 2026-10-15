import { useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { inOverflowLot, matchesTruckFilters, motionEndsAt, sampleMotion, type Motion, type Truck, type TruckId } from "@/game";
import { cameraView } from "@/store/cameraView";
import { useGameStore, type GameStore } from "@/store/gameStore";
import { COLORS, hueFor } from "./palette";
import { CLICK_SLOP, OutlineBox, SelectionRing } from "./Selection";
import { DECAL_UV, acquireDecal, decalKey, releaseDecal, type DecalSpec } from "./textures";

/*
 * All trucks, drawn with a handful of instanced meshes instead of ~20 meshes
 * per truck. Per-coin images live on one small decal mesh per truck, and only
 * for trucks outside the overflow lot. Positions come from each truck's
 * planned motion; parked trucks aren't rewritten, and moving trucks far from
 * the camera update at a lower rate.
 */

// Truck dimensions (metres). The nose points along local -z, so yaw 0 faces north.
const TRAILER = { width: 2.5, height: 2.8, length: 5.2, z: 0.9, y: 2.5 };
const CAB = { width: 2.4, height: 2.3, length: 2.0, z: -2.55, y: 1.95 };
const REAR_Z = TRAILER.z + TRAILER.length / 2;
const NOSE_Z = CAB.z - CAB.length / 2;
const LOGO_SIZE = 2.3;
const PLATE = { width: 2.2, height: 0.74 };

/** Opacity of trucks the HUD filters leave out: faded, not hidden. */
const DIMMED_OPACITY = 0.14;
/** Instance buffers grow in steps of this many trucks. */
const CAPACITY_STEP = 256;
/** Moving trucks outside the view (plus this margin, m) update every FAR_EVERY frames. */
const NEAR_MARGIN = 20;
const FAR_EVERY = 4;

// ---------------------------------------------------------------------------
// Geometry: one merged mesh per material, vertex colours for fixed tints.

function tinted(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function buildGeometries() {
  const wheels = [-2.7, 1.6, 2.7].flatMap((z) =>
    [-1.08, 1.08].map((x) =>
      tinted(new THREE.CylinderGeometry(0.48, 0.48, 0.42, 12).rotateZ(Math.PI / 2).translate(x, 0.48, z), new THREE.Color(COLORS.tire)),
    ),
  );
  return {
    dark: mergeGeometries([
      tinted(box(2.2, 0.32, 7, 0, 0.78, -0.1), new THREE.Color("#14171c")),
      tinted(box(2.1, 0.85, 0.04, 0, CAB.y + 0.45, NOSE_Z - 0.01), new THREE.Color(COLORS.glass)),
      ...wheels,
    ])!,
    // Cab and trailer share the coin colour (instance colour); the cab is a darker shade of it.
    body: mergeGeometries([
      tinted(box(CAB.width, CAB.height, CAB.length, 0, CAB.y, CAB.z), new THREE.Color().setRGB(0.5, 0.5, 0.5)),
      tinted(box(TRAILER.width, TRAILER.height, TRAILER.length, 0, TRAILER.y, TRAILER.z), new THREE.Color(1, 1, 1)),
    ])!,
    stripe: box(TRAILER.width + 0.04, 0.12, TRAILER.length, 0, TRAILER.y - TRAILER.height / 2 + 0.12, TRAILER.z),
    lights: mergeGeometries([
      ...[-0.8, 0.8].map((x) => tinted(box(0.45, 0.22, 0.05, x, 1.25, NOSE_Z - 0.02), new THREE.Color(COLORS.bulb))),
      ...[-0.95, 0.95].map((x) => tinted(box(0.35, 0.2, 0.04, x, 1.3, REAR_Z + 0.02), new THREE.Color(COLORS.taillight))),
    ])!,
  };
}

/** Both trailer sides (coin logo) and the rear ticker plate, as one mesh. */
function buildDecalGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  // Corners in viewer order: bottom-left, bottom-right, top-right, top-left.
  const quad = (corners: number[][], normal: number[], [u0, v0, u1, v1]: readonly number[]) => {
    const base = positions.length / 3;
    corners.forEach((c) => positions.push(...c));
    for (let i = 0; i < 4; i++) normals.push(...normal);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const sx = TRAILER.width / 2 + 0.02;
  const h = LOGO_SIZE / 2;
  const { y, z } = TRAILER;
  // Right side faces +x: the viewer's right is -z.
  quad([[sx, y - h, z + h], [sx, y - h, z - h], [sx, y + h, z - h], [sx, y + h, z + h]], [1, 0, 0], DECAL_UV.logo);
  // Left side faces -x: the viewer's right is +z.
  quad([[-sx, y - h, z - h], [-sx, y - h, z + h], [-sx, y + h, z + h], [-sx, y + h, z - h]], [-1, 0, 0], DECAL_UV.logo);
  // Rear plate faces +z.
  const py = TRAILER.y + 0.4;
  const rz = REAR_Z + 0.02;
  const pw = PLATE.width / 2;
  const ph = PLATE.height / 2;
  quad([[-pw, py - ph, rz], [pw, py - ph, rz], [pw, py + ph, rz], [-pw, py + ph, rz]], [0, 0, 1], DECAL_UV.plate);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

type PartName = "dark" | "body" | "stripe" | "lights";
const PARTS: readonly PartName[] = ["dark", "body", "stripe", "lights"];

// Built once, shared by every truck and kept for the page's life.
const GEOMETRY = { ...buildGeometries(), decal: buildDecalGeometry() };
const MATERIAL: Record<PartName, THREE.Material> = {
  dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 }),
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }),
  stripe: new THREE.MeshBasicMaterial(),
  lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};
const DIM_MATERIAL = Object.fromEntries(
  PARTS.map((p) => {
    const m = MATERIAL[p].clone();
    m.transparent = true;
    m.opacity = DIMMED_OPACITY;
    m.depthWrite = false;
    return [p, m];
  }),
) as Record<PartName, THREE.Material>;

// Coin colours by hue: a bounded cache (at most 360 × 2 entries).
const colorCache = new Map<string, THREE.Color>();
function coinTint(symbol: string, saturation: number, lightness: number): THREE.Color {
  const hue = hueFor(symbol);
  const key = `${hue}|${saturation}|${lightness}`;
  let c = colorCache.get(key);
  if (!c) {
    c = new THREE.Color().setHSL(hue / 360, saturation / 100, lightness / 100, THREE.SRGBColorSpace);
    colorCache.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Fleet state (imperative; React only sees the selection and capacity).

interface Layer {
  dim: boolean;
  parts: Record<PartName, THREE.InstancedMesh>;
  /** Truck drawn at each instance index. */
  trucks: Truck[];
}

function makeLayer(capacity: number, dim: boolean): Layer {
  const parts = {} as Record<PartName, THREE.InstancedMesh>;
  for (const name of PARTS) {
    const mesh = new THREE.InstancedMesh(GEOMETRY[name], (dim ? DIM_MATERIAL : MATERIAL)[name], capacity);
    mesh.count = 0;
    mesh.frustumCulled = false; // instances move; the whole fleet is cheap to draw
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = !dim && (name === "dark" || name === "body");
    mesh.receiveShadow = !dim && name === "body";
    if (name === "body" || name === "stripe") {
      mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // allocates instanceColor
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    // Only the body is clicked; skipping the rest keeps pointer events cheap.
    if (name === "body") mesh.userData.layer = dim ? 1 : 0;
    else mesh.raycast = () => {};
    parts[name] = mesh;
  }
  return { dim, parts, trucks: [] };
}

interface Decal {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  spec: DecalSpec;
}

type Pose = { x: number; z: number; yaw: number };

const matrix = new THREE.Matrix4();

/** Floor box around what the camera sees, grown by NEAR_MARGIN; null before the first frame. */
function viewBox() {
  const fp = cameraView.footprint;
  if (fp.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of fp) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX: minX - NEAR_MARGIN, maxX: maxX + NEAR_MARGIN, minZ: minZ - NEAR_MARGIN, maxZ: maxZ + NEAR_MARGIN };
}

/**
 * Owns the fleet's three.js objects and keeps them in sync with the store.
 * Imperative on purpose: one object updated per frame instead of one React
 * component per truck.
 */
class FleetRenderer {
  readonly root = new THREE.Group();
  private capacity = 0;
  private layers: Layer[] = [];
  private readonly decalGroup = new THREE.Group();
  private readonly decals = new Map<TruckId, Decal>();
  private pool: Decal["mesh"][] = [];
  /** Motion whose final pose is already written, per parked truck. */
  private readonly settled = new Map<TruckId, Motion>();
  private readonly poses = new Map<TruckId, Pose>();
  private seen: { world: unknown; coins: unknown; filters: unknown; wallet: unknown } | null = null;
  private frame = 0;

  constructor() {
    this.root.add(this.decalGroup);
    this.grow(CAPACITY_STEP);
  }

  /** Last drawn pose of a truck, if it's in the fleet. */
  poseOf(id: TruckId | null): Pose | undefined {
    return id ? this.poses.get(id) : undefined;
  }

  /** Truck under a pointer hit on the fleet. */
  truckAt(object: THREE.Object3D, instanceId: number | undefined): TruckId | undefined {
    const fromDecal = object.userData.truckId as TruckId | undefined;
    if (fromDecal) return fromDecal;
    const layer = object.userData.layer as number | undefined;
    return layer !== undefined && instanceId !== undefined ? this.layers[layer]?.trucks[instanceId]?.id : undefined;
  }

  sync(s: GameStore, focusIds: ReadonlyArray<TruckId | null>) {
    this.frame++;
    const now = Date.now();
    const structural =
      !this.seen ||
      s.world !== this.seen.world ||
      s.coins !== this.seen.coins ||
      s.filters !== this.seen.filters ||
      s.viewerWallet !== this.seen.wallet;
    if (structural) {
      if (s.world.trucks.length > this.capacity) this.grow(Math.ceil(s.world.trucks.length / CAPACITY_STEP) * CAPACITY_STEP);
      this.rebuild(s);
      this.settled.clear(); // instance indices may have moved
    }

    const near = viewBox();
    for (const layer of this.layers) {
      let changed = false;
      layer.trucks.forEach((t, i) => {
        const m = s.world.motions[t.id];
        if (!m || this.settled.get(t.id) === m) return; // parked trucks are already drawn in place
        const moving = now < motionEndsAt(m);
        // After a rebuild every index is rewritten: it may now hold a different truck.
        if (!structural && moving && near && !focusIds.includes(t.id) && (this.frame + i) % FAR_EVERY !== 0) {
          const last = this.poses.get(t.id);
          if (last && (last.x < near.minX || last.x > near.maxX || last.z < near.minZ || last.z > near.maxZ)) return;
        }
        const pose = sampleMotion(m, now);
        matrix.makeRotationY(pose.yaw).setPosition(pose.x, 0, pose.z);
        for (const name of PARTS) layer.parts[name].setMatrixAt(i, matrix);
        const decal = this.decals.get(t.id);
        if (decal) {
          decal.mesh.matrix.copy(matrix);
          decal.mesh.matrixWorldNeedsUpdate = true;
        }
        this.poses.set(t.id, pose);
        if (moving) this.settled.delete(t.id);
        else this.settled.set(t.id, m);
        changed = true;
      });
      if (changed) {
        for (const name of PARTS) {
          layer.parts[name].instanceMatrix.needsUpdate = true;
          layer.parts[name].boundingSphere = null; // recomputed lazily for the next pointer raycast
        }
      }
    }
    if (structural) for (const id of this.poses.keys()) if (!s.truckIndex[id]) this.poses.delete(id);
  }

  dispose() {
    for (const decal of this.decals.values()) {
      releaseDecal(decal.spec);
      decal.mesh.material.dispose();
    }
    for (const mesh of this.pool) mesh.material.dispose();
    this.decals.clear();
    this.pool = [];
    // Frees GPU buffers; three re-uploads them if the fleet is drawn again (e.g. a StrictMode remount).
    for (const layer of this.layers) for (const name of PARTS) layer.parts[name].dispose();
    this.settled.clear();
    this.seen = null;
  }

  private grow(capacity: number) {
    for (const layer of this.layers) {
      for (const name of PARTS) {
        this.root.remove(layer.parts[name]);
        layer.parts[name].dispose();
      }
    }
    this.capacity = capacity;
    this.layers = [makeLayer(capacity, false), makeLayer(capacity, true)];
    for (const layer of this.layers) for (const name of PARTS) this.root.add(layer.parts[name]);
    this.seen = null;
  }

  /** Re-sort trucks into the normal/dimmed layers and refresh colours and decals. Runs when store data changes. */
  private rebuild(s: GameStore) {
    this.seen = { world: s.world, coins: s.coins, filters: s.filters, wallet: s.viewerWallet };
    const [normal, dim] = this.layers;
    normal.trucks = [];
    dim.trucks = [];
    const wanted = new Map<TruckId, { spec: DecalSpec; dim: boolean }>();
    for (const t of s.world.trucks) {
      const coin = s.coins[t.mint];
      const visible = matchesTruckFilters(t, coin, s.filters, s.viewerWallet);
      (visible ? normal : dim).trucks.push(t);
      if (coin && !inOverflowLot(t.position)) {
        const color = `#${coinTint(coin.symbol, 55, 36).getHexString(THREE.SRGBColorSpace)}`;
        wanted.set(t.id, { spec: { mint: coin.mint, symbol: coin.symbol, imageUrl: coin.imageUrl, color }, dim: !visible });
      }
    }

    for (const layer of this.layers) {
      layer.trucks.forEach((t, i) => {
        const symbol = s.coins[t.mint]?.symbol ?? t.mint;
        layer.parts.body.setColorAt(i, coinTint(symbol, 55, 36));
        layer.parts.stripe.setColorAt(i, coinTint(symbol, 80, 60));
      });
      for (const name of PARTS) layer.parts[name].count = layer.trucks.length;
      layer.parts.body.instanceColor!.needsUpdate = true;
      layer.parts.stripe.instanceColor!.needsUpdate = true;
    }

    // Free decals no longer wanted: truck gone, parked in the overflow lot, or coin changed.
    for (const [id, decal] of this.decals) {
      const want = wanted.get(id);
      if (want && decalKey(want.spec) === decalKey(decal.spec)) continue;
      releaseDecal(decal.spec);
      decal.mesh.visible = false;
      decal.mesh.material.map = null;
      this.pool.push(decal.mesh);
      this.decals.delete(id);
    }
    for (const [id, want] of wanted) {
      let decal = this.decals.get(id);
      if (!decal) {
        const mesh =
          this.pool.pop() ??
          new THREE.Mesh(
            GEOMETRY.decal,
            new THREE.MeshBasicMaterial({ toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }),
          );
        if (!mesh.parent) this.decalGroup.add(mesh);
        mesh.matrixAutoUpdate = false;
        mesh.material.map = acquireDecal(want.spec);
        mesh.material.needsUpdate = true;
        mesh.visible = true;
        decal = { mesh, spec: want.spec };
        this.decals.set(id, decal);
      }
      decal.mesh.userData.truckId = id;
      const m = decal.mesh.material;
      if (m.transparent !== want.dim) {
        m.transparent = want.dim;
        m.depthWrite = !want.dim;
        m.needsUpdate = true;
      }
      m.opacity = want.dim ? DIMMED_OPACITY : 1;
    }
  }
}

// ---------------------------------------------------------------------------

export function TruckFleet() {
  const [renderer] = useState(() => new FleetRenderer());
  const overlay = useRef<THREE.Group>(null);
  const selectedId = useGameStore((s) => (s.selection?.kind === "truck" ? s.selection.id : null));
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  useEffect(() => () => renderer.dispose(), [renderer]);

  useFrame(() => {
    const s = useGameStore.getState();
    renderer.sync(s, [selectedId, s.followTruckId]);
    const o = overlay.current;
    if (!o) return;
    const pose = renderer.poseOf(selectedId);
    o.visible = Boolean(pose);
    if (pose) {
      o.position.set(pose.x, 0, pose.z);
      o.rotation.y = pose.yaw;
    }
  });

  return (
    <group>
      <primitive
        object={renderer.root}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta > CLICK_SLOP) return;
          const id = renderer.truckAt(e.object, e.instanceId);
          if (id) useGameStore.getState().select({ kind: "truck", id });
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      />
      <group ref={overlay} visible={false}>
        <SelectionRing radius={5} />
        <OutlineBox size={[CAB.width, CAB.height, CAB.length]} position={[0, CAB.y, CAB.z]} />
        <OutlineBox size={[TRAILER.width, TRAILER.height, TRAILER.length]} position={[0, TRAILER.y, TRAILER.z]} />
      </group>
    </group>
  );
}
