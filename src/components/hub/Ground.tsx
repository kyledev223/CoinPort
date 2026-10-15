import { Grid, Instance, Instances } from "@react-three/drei";
import { useMemo } from "react";
import { LOT_SLOT, OVERFLOW_LOT, ROAD_SEGMENTS, SLOT_SIZE, ZONES, ZONE_IDS, lotSlotPosition, type ZoneId } from "@/game";
import { HUB_KEEP_OUT } from "./city/cityLayout";
import { COLORS } from "./palette";

/** Floor extent: the whole city, up to the harbour's edge. */
const FLOOR = { center: [15, -62] as const, width: 630, depth: 436 };
/** The hub's grid lines stop at its fence, where the city begins. */
const HUB_GRID = { center: [(HUB_KEEP_OUT.minX + HUB_KEEP_OUT.maxX) / 2, (HUB_KEEP_OUT.minZ + HUB_KEEP_OUT.maxZ) / 2] as const, width: HUB_KEEP_OUT.maxX - HUB_KEEP_OUT.minX, depth: HUB_KEEP_OUT.maxZ - HUB_KEEP_OUT.minZ };

const ROAD_WIDTH = 6;
const DASH = { length: 1.8, gap: 2.2, width: 0.18 };

type Box = { position: [number, number, number]; scale: [number, number, number]; rotationY?: number };

export function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[FLOOR.center[0], 0, FLOOR.center[1]]} receiveShadow>
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.95} metalness={0.05} />
      </mesh>
      <Grid
        position={[HUB_GRID.center[0], 0.01, HUB_GRID.center[1]]}
        args={[HUB_GRID.width, HUB_GRID.depth]}
        cellSize={4}
        cellThickness={0.6}
        cellColor="#1a222d"
        sectionSize={20}
        sectionThickness={1.1}
        sectionColor="#283241"
        fadeDistance={260}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      <Roads />
      <ZonePads />
      <ParkingMarks />
      <LampPosts />
    </group>
  );
}

function Roads() {
  const { strips, dashes } = useMemo(() => {
    const strips: Box[] = [];
    const dashes: Box[] = [];
    for (const [a, b] of ROAD_SEGMENTS) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const rotationY = Math.atan2(dx, dz);
      strips.push({
        position: [(a.x + b.x) / 2, 0.012, (a.z + b.z) / 2],
        scale: [ROAD_WIDTH, 1, length + ROAD_WIDTH],
        rotationY,
      });
      for (let s = DASH.gap; s + DASH.length < length; s += DASH.length + DASH.gap) {
        const t = (s + DASH.length / 2) / length;
        dashes.push({
          position: [a.x + dx * t, 0.03, a.z + dz * t],
          scale: [DASH.width, 0.02, DASH.length],
          rotationY,
        });
      }
    }
    return { strips, dashes };
  }, []);

  return (
    <group>
      <Instances limit={strips.length} frames={1} receiveShadow>
        <boxGeometry args={[1, 0.001, 1]} />
        <meshStandardMaterial color="#0a0e13" roughness={1} />
        {strips.map((b, i) => (
          <Instance key={i} position={b.position} scale={b.scale} rotation-y={b.rotationY} />
        ))}
      </Instances>
      <Instances limit={dashes.length} frames={1}>
        <boxGeometry />
        <meshStandardMaterial color="#c9a04a" emissive="#c9a04a" emissiveIntensity={0.25} />
        {dashes.map((b, i) => (
          <Instance key={i} position={b.position} scale={b.scale} rotation-y={b.rotationY} />
        ))}
      </Instances>
    </group>
  );
}

/** A rectangle on the floor, by its edges. */
interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const zoneArea = (id: ZoneId): Area => {
  const { center, size } = ZONES[id];
  return {
    minX: center.x - size.width / 2,
    maxX: center.x + size.width / 2,
    minZ: center.z - size.depth / 2,
    maxZ: center.z + size.depth / 2,
  };
};

/** Every zone plus the overflow lot. */
const PAD_AREAS: Area[] = [...ZONE_IDS.map(zoneArea), OVERFLOW_LOT];

/** Floor pads with amber edge lines, one instanced mesh each. */
function ZonePads() {
  const { pads, edges } = useMemo(() => {
    const pads: Box[] = [];
    const edges: Box[] = [];
    const e = 0.25;
    for (const a of PAD_AREAS) {
      const w = a.maxX - a.minX;
      const d = a.maxZ - a.minZ;
      const cx = (a.minX + a.maxX) / 2;
      const cz = (a.minZ + a.maxZ) / 2;
      pads.push({ position: [cx, 0.02, cz], scale: [w, 1, d] });
      edges.push(
        { position: [cx, 0.04, a.minZ], scale: [w, 0.04, e] },
        { position: [cx, 0.04, a.maxZ], scale: [w, 0.04, e] },
        { position: [a.minX, 0.04, cz], scale: [e, 0.04, d] },
        { position: [a.maxX, 0.04, cz], scale: [e, 0.04, d] },
      );
    }
    return { pads, edges };
  }, []);

  return (
    <group>
      <Instances limit={pads.length} frames={1} receiveShadow>
        <boxGeometry args={[1, 0.001, 1]} />
        <meshStandardMaterial color={COLORS.pad} roughness={0.85} />
        {pads.map((b, i) => (
          <Instance key={i} position={b.position} scale={b.scale} />
        ))}
      </Instances>
      <Instances limit={edges.length} frames={1}>
        <boxGeometry />
        <meshStandardMaterial color={COLORS.padEdge} emissive={COLORS.padEdge} emissiveIntensity={0.35} />
        {edges.map((b, i) => (
          <Instance key={i} position={b.position} scale={b.scale} />
        ))}
      </Instances>
    </group>
  );
}

/** Slot divider lines matching `slotPosition`, in every zone trucks park in. */
function ParkingMarks() {
  const lines = useMemo(() => {
    const out: Box[] = [];
    for (const id of ZONE_IDS) {
      if (id === "launch-bay") continue; // trucks dock there, they don't park
      const { center, size } = ZONES[id];
      const cols = Math.floor(size.width / SLOT_SIZE.width);
      const rows = Math.max(1, Math.floor(size.depth / SLOT_SIZE.depth));
      const left = center.x - size.width / 2;
      const top = center.z - size.depth / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= cols; c++) {
          out.push({
            position: [left + c * SLOT_SIZE.width, 0.035, top + (r + 0.5) * SLOT_SIZE.depth],
            scale: [0.12, 0.02, SLOT_SIZE.depth - 1.2],
          });
        }
      }
    }
    // Overflow lot: bays face the aisle, so dividers run east–west between rows.
    for (let i = 0; ; i++) {
      const p = lotSlotPosition(i);
      if (p.z > OVERFLOW_LOT.maxZ) break;
      for (const dz of [-LOT_SLOT.depth / 2, LOT_SLOT.depth / 2]) {
        out.push({ position: [p.x, 0.035, p.z + dz], scale: [LOT_SLOT.width - 1.2, 0.02, 0.12] });
      }
    }
    return out;
  }, []);

  return (
    <Instances limit={lines.length} frames={1}>
      <boxGeometry />
      <meshStandardMaterial color="#4a5363" roughness={0.9} />
      {lines.map((b, i) => (
        <Instance key={i} position={b.position} scale={b.scale} />
      ))}
    </Instances>
  );
}

const LAMP_POSTS: Array<[number, number]> = [
  [-64, -21],
  [-32, -21],
  [2, -21],
  [36, -21],
  [70, -21],
  [-12, 37],
  [8, 37],
  [24, 37],
  [36, 38],
  [-74, 22],
  [-46, 40],
  [-42, -8],
  // Along both edges of the overflow lot.
  ...[-2, 20, 42, 64].flatMap((z): Array<[number, number]> => [
    [37, z],
    [95, z],
  ]),
];

function LampPosts() {
  return (
    <group>
      <Instances limit={LAMP_POSTS.length} frames={1} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 8, 6]} />
        <meshStandardMaterial color={COLORS.steel} roughness={0.6} metalness={0.4} />
        {LAMP_POSTS.map(([x, z], i) => (
          <Instance key={i} position={[x, 4, z]} />
        ))}
      </Instances>
      <Instances limit={LAMP_POSTS.length} frames={1}>
        <boxGeometry args={[0.7, 0.25, 0.7]} />
        <meshStandardMaterial color={COLORS.bulb} emissive={COLORS.bulb} emissiveIntensity={3} toneMapped={false} />
        {LAMP_POSTS.map(([x, z], i) => (
          <Instance key={i} position={[x, 8.1, z]} />
        ))}
      </Instances>
    </group>
  );
}
