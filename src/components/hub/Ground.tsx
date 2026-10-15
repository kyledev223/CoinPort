import { Grid, Instance, Instances } from "@react-three/drei";
import { useMemo } from "react";
import { ROAD_SEGMENTS, SLOT_SIZE, ZONES, ZONE_IDS, type ZoneId } from "@/game";
import { COLORS } from "./palette";

/** Floor extent: comfortably past the camera's pan limits. */
export const FLOOR = { center: [5, -8] as const, width: 280, depth: 230 };

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
        position={[FLOOR.center[0], 0.01, FLOOR.center[1]]}
        args={[FLOOR.width, FLOOR.depth]}
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
      {ZONE_IDS.map((id) => (
        <ZonePad key={id} zoneId={id} />
      ))}
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
      <Instances limit={strips.length} receiveShadow>
        <boxGeometry args={[1, 0.001, 1]} />
        <meshStandardMaterial color="#0a0e13" roughness={1} />
        {strips.map((b, i) => (
          <Instance key={i} position={b.position} scale={b.scale} rotation-y={b.rotationY} />
        ))}
      </Instances>
      <Instances limit={dashes.length}>
        <boxGeometry />
        <meshStandardMaterial color="#c9a04a" emissive="#c9a04a" emissiveIntensity={0.25} />
        {dashes.map((b, i) => (
          <Instance key={i} position={b.position} scale={b.scale} rotation-y={b.rotationY} />
        ))}
      </Instances>
    </group>
  );
}

function ZonePad({ zoneId }: { zoneId: ZoneId }) {
  const { center, size } = ZONES[zoneId];
  const edge = 0.25;
  const edges: Box[] = [
    { position: [center.x, 0.04, center.z - size.depth / 2], scale: [size.width, 0.04, edge] },
    { position: [center.x, 0.04, center.z + size.depth / 2], scale: [size.width, 0.04, edge] },
    { position: [center.x - size.width / 2, 0.04, center.z], scale: [edge, 0.04, size.depth] },
    { position: [center.x + size.width / 2, 0.04, center.z], scale: [edge, 0.04, size.depth] },
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[center.x, 0.02, center.z]} receiveShadow>
        <planeGeometry args={[size.width, size.depth]} />
        <meshStandardMaterial color={COLORS.pad} roughness={0.85} />
      </mesh>
      {edges.map((b, i) => (
        <mesh key={i} position={b.position} scale={b.scale}>
          <boxGeometry />
          <meshStandardMaterial color={COLORS.padEdge} emissive={COLORS.padEdge} emissiveIntensity={0.35} />
        </mesh>
      ))}
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
    return out;
  }, []);

  return (
    <Instances limit={lines.length}>
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
  [40, 37],
  [-74, 22],
  [-46, 40],
  [-42, -8],
];

function LampPosts() {
  return (
    <group>
      <Instances limit={LAMP_POSTS.length} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 8, 6]} />
        <meshStandardMaterial color={COLORS.steel} roughness={0.6} metalness={0.4} />
        {LAMP_POSTS.map(([x, z], i) => (
          <Instance key={i} position={[x, 4, z]} />
        ))}
      </Instances>
      <Instances limit={LAMP_POSTS.length}>
        <boxGeometry args={[0.7, 0.25, 0.7]} />
        <meshStandardMaterial color={COLORS.bulb} emissive={COLORS.bulb} emissiveIntensity={3} toneMapped={false} />
        {LAMP_POSTS.map(([x, z], i) => (
          <Instance key={i} position={[x, 8.1, z]} />
        ))}
      </Instances>
    </group>
  );
}
