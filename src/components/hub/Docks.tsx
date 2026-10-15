import { useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CRATES_PER_TRUCK, DOCKS, unloadSpots } from "@/game";
import { useGameStore, type GameStore } from "@/store/gameStore";
import { COLORS } from "./palette";
import { CLICK_SLOP, OutlineBox, SelectionRing } from "./Selection";
import { acquireCrateTexture, labelTexture, releaseCrateTexture } from "./textures";

/*
 * The six dock doors and the crates unloaded behind them, as a few instanced
 * meshes: frames, light strips, click targets, and one crate stack per dock.
 */

const CRATE = 1.1;
/** A docked trailer's tail sits just in front of this line. */
const frameZ = (dockZ: number) => dockZ - 4;

const FRAME_PARTS = [
  { size: [0.4, 6, 0.4], position: [-2.4, 3, 0], color: COLORS.beam },
  { size: [0.4, 6, 0.4], position: [2.4, 3, 0], color: COLORS.beam },
  { size: [5.2, 0.3, 0.4], position: [0, 6.1, 0], color: COLORS.beam },
  { size: [3.6, 0.7, 0.4], position: [0, 0.35, 0.3], color: "#2b2f36" },
] as const;
const STRIPS = [
  { size: [4.4, 0.1, 0.05], position: [0, 5.9, 0.22] },
  { size: [0.08, 5.6, 0.05], position: [-2.2, 3, 0.22] },
  { size: [0.08, 5.6, 0.05], position: [2.2, 3, 0.22] },
] as const;
const STRIP_ON = new THREE.Color(COLORS.amber);
const STRIP_OFF = new THREE.Color("#6b5a3a");

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const crateBox = new THREE.BoxGeometry(CRATE, CRATE, CRATE);
const hitBox = new THREE.BoxGeometry(4.6, 6, 0.6);
const frameMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2 });
const stripMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

const m4 = new THREE.Matrix4();
const NO_ROTATION = new THREE.Quaternion();
const place = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
  m4.compose(new THREE.Vector3(x, y, z), NO_ROTATION, new THREE.Vector3(sx, sy, sz));

/** Owns the docks' instanced meshes and keeps strip colours and crate stacks in sync with the store. */
class DockRenderer {
  readonly root = new THREE.Group();
  /** Click targets, one instance per dock (instance index = dock index). */
  readonly hits = new THREE.InstancedMesh(hitBox, hitMaterial, DOCKS.length);
  private readonly frames = new THREE.InstancedMesh(unitBox, frameMaterial, DOCKS.length * FRAME_PARTS.length);
  private readonly strips = new THREE.InstancedMesh(unitBox, stripMaterial, DOCKS.length * STRIPS.length);
  private readonly stacks: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  private readonly symbols = DOCKS.map(() => "");
  private seen: { bays: unknown; coins: unknown } | null = null;

  constructor() {
    DOCKS.forEach((dock, d) => {
      const fz = frameZ(dock.position.z);
      FRAME_PARTS.forEach((p, i) => {
        const k = d * FRAME_PARTS.length + i;
        this.frames.setMatrixAt(k, place(dock.position.x + p.position[0], p.position[1], fz + p.position[2], ...p.size));
        this.frames.setColorAt(k, new THREE.Color(p.color));
      });
      STRIPS.forEach((p, i) => {
        const k = d * STRIPS.length + i;
        this.strips.setMatrixAt(k, place(dock.position.x + p.position[0], p.position[1], fz + p.position[2], ...p.size));
        this.strips.setColorAt(k, STRIP_OFF);
      });
      this.hits.setMatrixAt(d, place(dock.position.x, 3, fz));
    });
    this.frames.castShadow = true;
    this.frames.receiveShadow = true;
    this.frames.raycast = () => {};
    this.strips.raycast = () => {};
    this.strips.instanceColor!.setUsage(THREE.DynamicDrawUsage);

    this.stacks = DOCKS.map((dock) => {
      const stack = unloadSpots(dock.id).stack;
      const mesh = new THREE.InstancedMesh(crateBox, new THREE.MeshStandardMaterial({ roughness: 0.8 }), CRATES_PER_TRUCK);
      for (let i = 0; i < CRATES_PER_TRUCK; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2) % 2;
        const level = Math.floor(i / 4);
        mesh.setMatrixAt(i, place(stack.x + (col - 0.5) * 1.2, CRATE / 2 + level * CRATE, stack.z + (row - 0.5) * 1.2));
      }
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.raycast = () => {};
      return mesh;
    });

    this.root.add(this.frames, this.strips, this.hits, ...this.stacks);
  }

  sync(s: GameStore) {
    if (this.seen && s.world.bays === this.seen.bays && s.coins === this.seen.coins) return;
    this.seen = { bays: s.world.bays, coins: s.coins };
    DOCKS.forEach((dock, d) => {
      const bay = s.world.bays[dock.id];
      const occupied = Boolean(bay?.truckId);
      for (let i = 0; i < STRIPS.length; i++) this.strips.setColorAt(d * STRIPS.length + i, occupied ? STRIP_ON : STRIP_OFF);

      // Crates are stamped with the docked coin's ticker; the texture is shared and released when the dock empties.
      const symbol = bay?.mint ? (s.coins[bay.mint]?.symbol ?? "") : "";
      const stack = this.stacks[d];
      if (symbol !== this.symbols[d]) {
        if (this.symbols[d]) releaseCrateTexture(this.symbols[d]);
        this.symbols[d] = symbol;
        stack.material.map = symbol ? acquireCrateTexture(symbol) : null;
        stack.material.needsUpdate = true;
      }
      stack.count = symbol ? (bay?.crates ?? 0) : 0;
    });
    this.strips.instanceColor!.needsUpdate = true;
  }

  dispose() {
    this.symbols.forEach((sym, d) => {
      if (sym) releaseCrateTexture(sym);
      this.symbols[d] = "";
      this.stacks[d].material.map = null;
    });
    for (const m of [this.frames, this.strips, this.hits, ...this.stacks]) m.dispose();
    this.seen = null;
  }
}

export function Docks() {
  const [docks] = useState(() => new DockRenderer());
  const selectedDock = useGameStore((s) => (s.selection?.kind === "dock" ? DOCKS.find((d) => d.id === s.selection!.id) : undefined));
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  useEffect(() => () => docks.dispose(), [docks]);
  useFrame(() => docks.sync(useGameStore.getState()));

  return (
    <group>
      <primitive
        object={docks.root}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta > CLICK_SLOP || e.object !== docks.hits || e.instanceId === undefined) return;
          useGameStore.getState().select({ kind: "dock", id: DOCKS[e.instanceId].id });
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      />
      {DOCKS.map((dock) => (
        <DockNumber key={dock.id} x={dock.position.x} z={frameZ(dock.position.z)} number={dock.number} />
      ))}
      {selectedDock && (
        <group position={[selectedDock.position.x, 0, frameZ(selectedDock.position.z)]}>
          <SelectionRing radius={3.6} z={-1.5} />
          {FRAME_PARTS.map((p, i) => (
            <OutlineBox key={i} size={p.size} position={p.position} />
          ))}
        </group>
      )}
    </group>
  );
}

function DockNumber({ x, z, number }: { x: number; z: number; number: number }) {
  const map = useMemo(
    () =>
      labelTexture({
        text: String(number).padStart(2, "0"),
        background: "#0c1016",
        color: COLORS.amber,
        border: COLORS.amberHot,
        width: 256,
        height: 128,
      }),
    [number],
  );
  return (
    <mesh position={[x, 6.9, z + 0.21]}>
      <planeGeometry args={[1.4, 0.7]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}
