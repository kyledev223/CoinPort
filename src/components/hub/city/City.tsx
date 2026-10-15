import { useFrame } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BUILDING_SIZES, buildCity, type BuildingType, type Box, type CityLayout, type Placed, type Rect } from "./cityLayout";

/*
 * The city around the hub, drawn as a few dozen static instanced meshes.
 * Decoration only: not clickable, no shadows, nothing updates except the
 * blinking aircraft lights on tower masts.
 */

const STREET_WIDTH = 10;
const BEACON_ON = new THREE.Color("#ff3b2f");
const BEACON_OFF = new THREE.Color("#3a0d0a");
const WINDOW = { cols: 16, rows: 16, width: 4, height: 3.5 };

// ---------------------------------------------------------------------------
// Textures

function facadeTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 512;
  const cell = size / WINDOW.cols;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  };
  const wall = make();
  const glow = make();
  const w = wall.getContext("2d")!;
  const g = glow.getContext("2d")!;
  w.fillStyle = "#c9ccd1";
  w.fillRect(0, 0, size, size);
  g.fillStyle = "#000000";
  g.fillRect(0, 0, size, size);
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < WINDOW.rows; row++) {
    // Floor slab line.
    w.fillStyle = "#a9adb3";
    w.fillRect(0, row * cell, size, 2);
    for (let col = 0; col < WINDOW.cols; col++) {
      const x = col * cell + cell * 0.18;
      const y = row * cell + cell * 0.22;
      const ww = cell * 0.64;
      const wh = cell * 0.56;
      const r = rand();
      const lit = r < 0.32 ? (r < 0.22 ? "#ffcf80" : "#cfe0ff") : null;
      w.fillStyle = lit ?? "#1b222b";
      w.fillRect(x, y, ww, wh);
      if (lit) {
        g.fillStyle = lit;
        g.fillRect(x, y, ww, wh);
      }
    }
  }
  const tex = (canvas: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(wall), emissive: tex(glow) };
}

/** Corrugated steel: vertical ridges, tinted per container. */
function corrugatedTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  for (let x = 0; x < c.width; x += 4) {
    ctx.fillStyle = (x / 4) % 2 ? "#d9d9d9" : "#ffffff";
    ctx.fillRect(x, 0, 4, c.height);
  }
  ctx.fillStyle = "#9a9a9a";
  ctx.fillRect(0, 0, c.width, 2);
  ctx.fillRect(0, c.height - 2, c.width, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Geometry helpers

function tinted(geometry: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A building box with its base at y = 0 and facade UVs scaled so windows keep a real-world size. */
function buildingGeometry(type: BuildingType): THREE.BufferGeometry {
  const { w, d, h } = BUILDING_SIZES[type];
  const g = box(w, h, d, 0, h / 2, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const tileW = WINDOW.cols * WINDOW.width;
  const tileH = WINDOW.rows * WINDOW.height;
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const faceWidth = [d, d, w, w, w, w];
  const faceHeight = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * faceWidth[f]) / tileW, (uv.getY(i) * faceHeight[f]) / tileH);
    }
  }
  return g;
}

const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  items: ReadonlyArray<{ x: number; y?: number; z: number; rotY?: number; sx?: number; sy?: number; sz?: number; color?: string }>,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  const color = new THREE.Color();
  items.forEach((it, i) => {
    quat.setFromAxisAngle(up, it.rotY ?? 0);
    pos.set(it.x, it.y ?? 0, it.z);
    scl.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    mesh.setMatrixAt(i, matrix.compose(pos, quat, scl));
    if (it.color) mesh.setColorAt(i, color.set(it.color));
  });
  mesh.raycast = () => {}; // decoration: never intercepts clicks
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** Thin slab covering a rectangle, top at `top`. */
const slab = (r: Rect, top: number, thickness = 0.12) => ({
  x: (r.minX + r.maxX) / 2,
  y: top - thickness / 2,
  z: (r.minZ + r.maxZ) / 2,
  sx: r.maxX - r.minX,
  sy: thickness,
  sz: r.maxZ - r.minZ,
});

const placed = (p: Placed, y = 0) => ({ x: p.x, y, z: p.z, rotY: p.rotY, sx: p.scale, sy: p.scale, sz: p.scale, color: p.color });
const boxItem = (b: Box) => ({ x: b.x, y: b.y, z: b.z, sx: b.sx, sy: b.sy, sz: b.sz });

// ---------------------------------------------------------------------------

/** Builds and owns every city mesh. */
class CityRenderer {
  readonly root = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly beacon: THREE.MeshBasicMaterial;

  constructor(layout: CityLayout) {
    const own = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);
    const add = (...meshes: THREE.Object3D[]) => this.root.add(...meshes);
    const std = (o: THREE.MeshStandardMaterialParameters) => own(new THREE.MeshStandardMaterial(o));
    const unitBox = own(new THREE.BoxGeometry(1, 1, 1));

    // Ground: streets, centre lines, sidewalks, block grounds, walkways, crosswalks, water.
    const streets = layout.streets.map(({ a, b }) => {
      const alongX = a.z === b.z;
      const len = alongX ? b.x - a.x : b.z - a.z;
      return {
        x: (a.x + b.x) / 2,
        y: 0.005,
        z: (a.z + b.z) / 2,
        sx: alongX ? len + STREET_WIDTH : STREET_WIDTH,
        sy: 0.01,
        sz: alongX ? STREET_WIDTH : len + STREET_WIDTH,
      };
    });
    const dashes = layout.streets.flatMap(({ a, b }) => {
      const alongX = a.z === b.z;
      const len = alongX ? b.x - a.x : b.z - a.z;
      const out = [];
      for (let s = 8; s < len - 8; s += 6) {
        out.push(
          alongX
            ? { x: a.x + s, y: 0.02, z: a.z, sx: 2.4, sy: 0.02, sz: 0.16 }
            : { x: a.x, y: 0.02, z: a.z + s, sx: 0.16, sy: 0.02, sz: 2.4 },
        );
      }
      return out;
    });
    add(
      instanced(unitBox, std({ color: "#0b0f15", roughness: 1 }), streets),
      instanced(unitBox, std({ color: "#b89a52", emissive: "#b89a52", emissiveIntensity: 0.15 }), dashes),
      instanced(unitBox, std({ color: "#2b323c", roughness: 0.95 }), layout.sidewalks.map((r) => slab(r, 0.12))),
      instanced(unitBox, std({ color: "#1e2a22", roughness: 1 }), layout.grounds.filter((g) => g.kind === "grass").map((r) => slab(r, 0.14))),
      instanced(unitBox, std({ color: "#232932", roughness: 0.9 }), layout.grounds.filter((g) => g.kind === "paved").map((r) => slab(r, 0.14))),
      instanced(unitBox, std({ color: "#3a3f47", roughness: 0.9 }), layout.paths.map((r) => slab(r, 0.16))),
      instanced(unitBox, std({ color: "#d9dde3", roughness: 0.8 }), layout.crosswalks.map(boxItem)),
    );
    const w = layout.water;
    const water = new THREE.Mesh(
      own(new THREE.PlaneGeometry(w.maxX - w.minX, w.maxZ - w.minZ).rotateX(-Math.PI / 2)),
      std({ color: "#08131f", roughness: 0.18, metalness: 0.6 }),
    );
    water.position.set((w.minX + w.maxX) / 2, -0.6, (w.minZ + w.maxZ) / 2);
    water.raycast = () => {};
    const quay = new THREE.Mesh(unitBox, std({ color: "#3a3f47", roughness: 0.9 }));
    quay.scale.set(w.maxX - w.minX, 1.2, 1);
    quay.position.set((w.minX + w.maxX) / 2, -0.45, w.minZ);
    quay.raycast = () => {};
    add(water, quay);

    // Buildings: one instanced mesh per type. Walls tile the window texture; roofs are plain.
    const { map, emissive } = facadeTextures();
    own(map);
    own(emissive);
    const facade = std({ map, emissiveMap: emissive, emissive: "#ffffff", emissiveIntensity: 1.15, roughness: 0.85, metalness: 0.1 });
    const roof = std({ color: "#3a4049", roughness: 0.95 });
    const faces = [facade, facade, roof, roof, facade, facade];
    for (const type of Object.keys(BUILDING_SIZES) as BuildingType[]) {
      const items = layout.buildings.filter((b) => b.type === type);
      if (items.length === 0) continue;
      add(instanced(own(buildingGeometry(type)), faces, items.map((b) => placed(b))));
    }
    add(instanced(unitBox, std({ color: "#5a616b", roughness: 0.8 }), layout.roofUnits.map(boxItem)));

    // Tower masts with blinking aircraft lights.
    add(
      instanced(
        unitBox,
        std({ color: "#4a5059", roughness: 0.6, metalness: 0.5 }),
        layout.antennas.map((a) => ({ x: a.x, y: a.y + 4, z: a.z, sx: 0.35, sy: 8, sz: 0.35 })),
      ),
    );
    this.beacon = own(new THREE.MeshBasicMaterial({ color: "#ff3b2f", toneMapped: false }));
    add(instanced(own(new THREE.SphereGeometry(0.45, 8, 6)), this.beacon, layout.antennas.map((a) => ({ x: a.x, y: a.y + 8.4, z: a.z }))));

    // Trees: trunks plus a low-poly crown tinted per tree.
    add(
      instanced(own(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6).translate(0, 1.2, 0)), std({ color: "#4a3626", roughness: 1 }), layout.trees.map((t) => placed({ ...t, color: "" }))),
      instanced(own(new THREE.IcosahedronGeometry(1.9, 0).translate(0, 3.6, 0)), std({ roughness: 0.9, flatShading: true }), layout.trees.map((t) => placed(t))),
    );

    // Benches: wooden seat and back on dark legs.
    const bench = own(
      mergeGeometries([
        tinted(box(1.8, 0.1, 0.5, 0, 0.45, 0), "#6b4a2e"),
        tinted(box(1.8, 0.45, 0.08, 0, 0.75, -0.24), "#6b4a2e"),
        tinted(box(0.08, 0.45, 0.45, -0.8, 0.22, 0), "#22262b"),
        tinted(box(0.08, 0.45, 0.45, 0.8, 0.22, 0), "#22262b"),
      ])!,
    );
    add(instanced(bench, std({ vertexColors: true, roughness: 0.8 }), layout.benches.map((b) => placed({ ...b, color: "" }))));

    // Street lamps: pole and glowing head.
    add(
      instanced(own(new THREE.CylinderGeometry(0.1, 0.14, 6, 6).translate(0, 3, 0)), std({ color: "#3b434e", roughness: 0.6, metalness: 0.4 }), layout.lamps.map((l) => placed({ ...l, color: "" }))),
      instanced(own(box(0.6, 0.2, 0.6, 0, 6.1, 0)), own(new THREE.MeshBasicMaterial({ color: "#ffd68a", toneMapped: false })), layout.lamps.map((l) => placed({ ...l, color: "" }))),
    );

    // Parked cars: painted body with a dark cabin, plus head and tail lights.
    const carBody = own(
      mergeGeometries([tinted(box(1.9, 0.75, 4.4, 0, 0.55, 0), "#ffffff"), tinted(box(1.7, 0.6, 2.2, 0, 1.2, 0.2), "#2a3038")])!,
    );
    const carLights = own(
      mergeGeometries([
        tinted(box(0.4, 0.15, 0.05, -0.6, 0.65, -2.21), "#ffe6a8"),
        tinted(box(0.4, 0.15, 0.05, 0.6, 0.65, -2.21), "#ffe6a8"),
        tinted(box(0.4, 0.15, 0.05, -0.6, 0.65, 2.21), "#ff3b2f"),
        tinted(box(0.4, 0.15, 0.05, 0.6, 0.65, 2.21), "#ff3b2f"),
      ])!,
    );
    add(
      instanced(carBody, std({ vertexColors: true, roughness: 0.45, metalness: 0.4 }), layout.cars.map((c) => placed(c))),
      instanced(carLights, own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })), layout.cars.map((c) => placed({ ...c, color: "" }))),
    );

    // Fountains on plazas.
    add(
      instanced(own(new THREE.CylinderGeometry(4, 4.3, 0.8, 20).translate(0, 0.4, 0)), std({ color: "#5c636d", roughness: 0.9 }), layout.fountains.map((f) => placed({ ...f, color: "" }))),
      instanced(own(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 20).translate(0, 0.75, 0)), std({ color: "#2a5f86", roughness: 0.15, metalness: 0.5, emissive: "#0e2c44", emissiveIntensity: 0.6 }), layout.fountains.map((f) => placed({ ...f, color: "" }))),
      instanced(own(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 10).translate(0, 1.1, 0)), std({ color: "#7c838d", roughness: 0.7 }), layout.fountains.map((f) => placed({ ...f, color: "" }))),
    );

    // Shipping containers in the hub's empty corners: these sit in the lit hub, so they cast shadows.
    const containers = instanced(
      unitBox,
      std({ map: own(corrugatedTexture()), roughness: 0.7, metalness: 0.3 }),
      layout.containers.map((c) => ({ ...boxItem(c), color: c.color })),
    );
    containers.castShadow = true;
    containers.receiveShadow = true;
    add(containers);

    // Fence around the hub: posts and two rails per run.
    const fenceMat = std({ color: "#4b535e", roughness: 0.6, metalness: 0.5 });
    add(instanced(unitBox, fenceMat, layout.fence.posts.map((p) => ({ x: p.x, y: 1.1, z: p.z, sx: 0.15, sy: 2.2, sz: 0.15 }))));
    const rails = layout.fence.rails.flatMap(({ a, b }) => {
      const alongX = a.z === b.z;
      const len = Math.abs(alongX ? b.x - a.x : b.z - a.z);
      return [0.9, 2.0].map((y) => ({
        x: (a.x + b.x) / 2,
        y,
        z: (a.z + b.z) / 2,
        sx: alongX ? len : 0.08,
        sy: 0.08,
        sz: alongX ? 0.08 : len,
      }));
    });
    add(instanced(unitBox, fenceMat, rails));
  }

  /** Blink the masts' aircraft lights. */
  tick(seconds: number) {
    this.beacon.color.set(Math.sin(seconds * 3) > 0.2 ? BEACON_ON : BEACON_OFF);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
  }
}

/** The city around the hub. */
export function City() {
  const [city] = useState(() => new CityRenderer(buildCity()));
  useEffect(() => () => city.dispose(), [city]);
  useFrame(({ clock }) => city.tick(clock.elapsedTime));
  return <primitive object={city.root} />;
}
