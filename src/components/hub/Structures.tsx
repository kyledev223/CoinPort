import { Instance, Instances } from "@react-three/drei";
import { useMemo } from "react";
import { DOCKS, ENTRY_ARCH_Z, GRADUATION_ARCH_Z, ZONES, type StorageTier, type StorageZoneId } from "@/game";
import { COLORS, TIER_CRATE_COLORS } from "./palette";
import { labelTexture } from "./textures";

type Vec = [number, number, number];

export function Structures() {
  return (
    <group>
      <Gate zone="entry-gate" archZ={ENTRY_ARCH_Z} text="ENTRY GATE" />
      <Gate zone="graduation-gate" archZ={GRADUATION_ARCH_Z} text="GRADUATION GATE" />
      <LaunchBay />
      {(["storage-a", "storage-b", "storage-c"] as const).map((id) => (
        <StorageHall key={id} zoneId={id} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces

function Block({ position, scale, color = COLORS.wall }: { position: Vec; scale: Vec; color?: string }) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color={color} roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

function LightStrip({ position, scale }: { position: Vec; scale: Vec }) {
  return (
    <mesh position={position} scale={scale}>
      <boxGeometry />
      <meshStandardMaterial color={COLORS.amber} emissive={COLORS.amber} emissiveIntensity={2.5} toneMapped={false} />
    </mesh>
  );
}

/** Glowing text plate facing +z. */
function Sign({
  text,
  subtitle,
  position,
  width,
  height,
}: {
  text: string;
  subtitle?: string;
  position: Vec;
  width: number;
  height: number;
}) {
  const map = useMemo(
    () =>
      labelTexture({
        text,
        subtitle,
        background: "#0c1016",
        color: COLORS.amber,
        border: COLORS.amberHot,
        width: Math.round((128 * width) / height),
        height: 128,
      }),
    [text, subtitle, width, height],
  );
  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Entry and Graduation gates: a lit portal frame trucks drive through (northbound).

function Gate({ zone, archZ, text }: { zone: "entry-gate" | "graduation-gate"; archZ: number; text: string }) {
  const { center, size } = ZONES[zone];
  const half = size.width / 2 + 0.7;
  return (
    <group position={[center.x, 0, archZ]}>
      <Block position={[-half, 4.6, 0]} scale={[1.4, 9.2, 1.4]} color={COLORS.beam} />
      <Block position={[half, 4.6, 0]} scale={[1.4, 9.2, 1.4]} color={COLORS.beam} />
      <Block position={[0, 8.7, 0]} scale={[size.width + 2.8, 1.8, 1.4]} color={COLORS.beam} />
      <Sign text={text} position={[0, 8.7, 0.72]} width={size.width * 0.8} height={1.5} />
      <LightStrip position={[0, 7.7, 0.45]} scale={[size.width, 0.16, 0.25]} />
      <LightStrip position={[0, 7.7, -0.45]} scale={[size.width, 0.16, 0.25]} />
      <LightStrip position={[-half, 4.6, 0.72]} scale={[0.2, 8, 0.05]} />
      <LightStrip position={[half, 4.6, 0.72]} scale={[0.2, 8, 0.05]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Launch Bay: open-fronted hall with a canopy at the back. Dock frames live in Docks.tsx.

function LaunchBay() {
  const { center, size } = ZONES["launch-bay"];
  const x0 = center.x - size.width / 2;
  const x1 = center.x + size.width / 2;
  const z0 = center.z - size.depth / 2;
  const frontZ = DOCKS[0].position.z - 4; // just behind a docked trailer's tail

  const crates = useMemo(() => {
    const out: Array<{ position: Vec; color: string }> = [];
    const colors = [...TIER_CRATE_COLORS[1], ...TIER_CRATE_COLORS[2], ...TIER_CRATE_COLORS[3]];
    for (let i = 0; i < 14; i++) {
      const stack = i % 3 === 0 ? 2 : 1;
      for (let s = 0; s < stack; s++) {
        out.push({
          position: [x0 + 2.5 + i * 2.6, 0.7 + s * 1.4, z0 + 2.2 + (i % 2) * 1.6],
          color: colors[(i * 7 + s) % colors.length],
        });
      }
    }
    return out;
  }, [x0, z0]);

  return (
    <group>
      <Block position={[center.x, 4.5, z0 + 0.5]} scale={[size.width + 1, 9, 1]} />
      <Block position={[x0, 4.5, z0 + 5]} scale={[1, 9, 10]} />
      <Block position={[x1, 4.5, z0 + 5]} scale={[1, 9, 10]} />
      <Block position={[center.x, 9.25, z0 + 5]} scale={[size.width + 1.4, 0.5, 10.4]} color={COLORS.roof} />
      <Block position={[x0, 4.7, frontZ]} scale={[1, 9.4, 1]} color={COLORS.beam} />
      <Block position={[x1, 4.7, frontZ]} scale={[1, 9.4, 1]} color={COLORS.beam} />
      <Block position={[x0, 9.1, (z0 + 10 + frontZ) / 2]} scale={[0.6, 0.6, frontZ - z0 - 10]} color={COLORS.beam} />
      <Block position={[x1, 9.1, (z0 + 10 + frontZ) / 2]} scale={[0.6, 0.6, frontZ - z0 - 10]} color={COLORS.beam} />
      <Block position={[center.x, 8.6, frontZ]} scale={[size.width + 1, 1.6, 1]} color={COLORS.beam} />
      <Sign text="LAUNCH BAY" position={[center.x, 8.6, frontZ + 0.52]} width={16} height={1.4} />
      <LightStrip position={[center.x, 7.75, frontZ + 0.4]} scale={[size.width, 0.14, 0.2]} />


      <Instances limit={crates.length} castShadow receiveShadow>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial roughness={0.7} />
        {crates.map((c, i) => (
          <Instance key={i} position={c.position} color={c.color} />
        ))}
      </Instances>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Storage halls: shelving under a roof at the back, open parking floor in front.

const HALL = { backDepth: 8, height: 10, rackUnits: 6, rackWidth: 4, rackDepth: 2, levels: [0.2, 2.2, 4.2] };

function StorageHall({ zoneId }: { zoneId: StorageZoneId }) {
  const zone = ZONES[zoneId];
  const tier = zone.tier as StorageTier;
  const { center, size } = zone;
  const x0 = center.x - size.width / 2;
  const x1 = center.x + size.width / 2;
  const z0 = center.z - size.depth / 2; // north edge of the parking floor
  const roofZ = z0 - HALL.backDepth / 2 + 1;

  const { steel, crates } = useMemo(() => {
    const steel: Array<{ position: Vec; scale: Vec }> = [];
    const crates: Array<{ position: Vec; color: string }> = [];
    const palette = TIER_CRATE_COLORS[tier];
    const gap = (size.width - HALL.rackUnits * HALL.rackWidth) / (HALL.rackUnits + 1);
    const rows = [z0 - 5, z0 - 1.6];
    rows.forEach((rz, row) => {
      for (let u = 0; u < HALL.rackUnits; u++) {
        const rx = x0 + gap + HALL.rackWidth / 2 + u * (HALL.rackWidth + gap);
        for (const dx of [-1, 1])
          for (const dz of [-1, 1])
            steel.push({
              position: [rx + (dx * HALL.rackWidth) / 2, 3.1, rz + (dz * HALL.rackDepth) / 2],
              scale: [0.15, 6.2, 0.15],
            });
        HALL.levels.forEach((y, level) => {
          steel.push({ position: [rx, y, rz], scale: [HALL.rackWidth, 0.12, HALL.rackDepth] });
          for (let k = 0; k < 2; k++) {
            // Deterministic gaps so shelves look used, not full.
            if ((u * 5 + level * 3 + k + row * 2 + tier) % 4 === 0) continue;
            crates.push({
              position: [rx + (k - 0.5) * 1.9, y + 0.82, rz],
              color: palette[(u + level + k + row) % palette.length],
            });
          }
        });
      }
    });
    return { steel, crates };
  }, [tier, size.width, x0, z0]);

  return (
    <group>
      <Block position={[center.x, HALL.height / 2, z0 - HALL.backDepth + 0.5]} scale={[size.width + 1, HALL.height, 1]} />
      <Block position={[x0, HALL.height / 2, roofZ]} scale={[1, HALL.height, HALL.backDepth + 2]} />
      <Block position={[x1, HALL.height / 2, roofZ]} scale={[1, HALL.height, HALL.backDepth + 2]} />
      <Block
        position={[center.x, HALL.height + 0.25, roofZ]}
        scale={[size.width + 1.4, 0.5, HALL.backDepth + 2.4]}
        color={COLORS.roof}
      />
      <Block position={[center.x, HALL.height - 1.5, z0 + 2]} scale={[size.width + 1, 3, 0.6]} color={COLORS.beam} />
      <Sign
        text={zone.label.toUpperCase()}
        subtitle={zone.subtitle?.toUpperCase()}
        position={[center.x, HALL.height - 1.5, z0 + 2.31]}
        width={11}
        height={2.6}
      />
      <LightStrip position={[center.x, HALL.height - 3.1, z0 + 2.2]} scale={[size.width, 0.12, 0.15]} />
      <pointLight position={[center.x, HALL.height - 2, z0 - 3]} color={COLORS.amber} intensity={420} distance={28} decay={2} />

      <Instances limit={steel.length} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color={COLORS.steel} roughness={0.5} metalness={0.6} />
        {steel.map((s, i) => (
          <Instance key={i} position={s.position} scale={s.scale} />
        ))}
      </Instances>
      <Instances limit={crates.length} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.5, 1.6]} />
        <meshStandardMaterial roughness={0.7} />
        {crates.map((c, i) => (
          <Instance key={i} position={c.position} color={c.color} />
        ))}
      </Instances>
    </group>
  );
}
