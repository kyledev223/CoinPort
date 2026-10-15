import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { memo, useMemo, useState } from "react";
import * as THREE from "three";
import { DOCKS, unloadSpots, type DockId } from "@/game";
import { selectIsSelected, useGameStore } from "@/store/gameStore";
import { COLORS } from "./palette";
import { labelTexture } from "./textures";
import { CLICK_SLOP, OutlineBox, SelectionRing } from "./Selection";

const CRATE = 1.1;
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  crate: new THREE.BoxGeometry(CRATE, CRATE, CRATE),
};
const FRAME = [
  { size: [0.4, 6, 0.4], position: [-2.4, 3, 0], color: COLORS.beam },
  { size: [0.4, 6, 0.4], position: [2.4, 3, 0], color: COLORS.beam },
  { size: [5.2, 0.3, 0.4], position: [0, 6.1, 0], color: COLORS.beam },
  { size: [3.6, 0.7, 0.4], position: [0, 0.35, 0.3], color: "#2b2f36" },
] as const;

/** Ticker-stamped crate texture, shared by stacks and forklifts. */
export function crateTexture(symbol: string): THREE.CanvasTexture {
  return labelTexture({ text: symbol, background: "#b98a4a", color: "#2a1a08", border: "#5a3d17", width: 256, height: 256 });
}

export function Docks() {
  return (
    <>
      {DOCKS.map((d) => (
        <DockModel key={d.id} dockId={d.id} />
      ))}
    </>
  );
}

/** Dock door frame (clickable) and the crates unloaded behind it. */
const DockModel = memo(function DockModel({ dockId }: { dockId: DockId }) {
  const dock = DOCKS.find((d) => d.id === dockId)!;
  const crates = useGameStore((s) => s.world.bays[dockId]?.crates ?? 0);
  const symbol = useGameStore((s) => {
    const mint = s.world.bays[dockId]?.mint;
    return mint ? (s.coins[mint]?.symbol ?? "") : "";
  });
  const occupied = useGameStore((s) => s.world.bays[dockId]?.truckId != null);
  const selected = useGameStore(selectIsSelected("dock", dockId));
  const select = useGameStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const frontZ = dock.position.z - 4; // just behind a docked trailer's tail
  const number = useMemo(
    () =>
      labelTexture({
        text: String(dock.number).padStart(2, "0"),
        background: "#0c1016",
        color: COLORS.amber,
        border: COLORS.amberHot,
        width: 256,
        height: 128,
      }),
    [dock.number],
  );
  const stack = unloadSpots(dockId).stack;
  const crateMap = useMemo(() => (symbol ? crateTexture(symbol) : null), [symbol]);
  const strip = occupied ? COLORS.amber : "#6b5a3a";

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    select({ kind: "dock", id: dockId });
  };

  return (
    <group>
      <group
        position={[dock.position.x, 0, frontZ]}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        {selected && <SelectionRing radius={3.6} z={-1.5} />}
        {FRAME.map((part, i) => (
          <mesh key={i} geometry={GEO.box} position={part.position} scale={part.size} castShadow receiveShadow>
            <meshStandardMaterial color={part.color} roughness={0.8} metalness={0.2} />
          </mesh>
        ))}
        {selected && FRAME.map((part, i) => <OutlineBox key={i} size={part.size} position={part.position} />)}
        {(
          [
            [[0, 5.9, 0.22], [4.4, 0.1, 0.05]],
            [[-2.2, 3, 0.22], [0.08, 5.6, 0.05]],
            [[2.2, 3, 0.22], [0.08, 5.6, 0.05]],
          ] as const
        ).map(([position, scale], i) => (
          <mesh key={i} geometry={GEO.box} position={position} scale={scale}>
            <meshStandardMaterial color={strip} emissive={strip} emissiveIntensity={occupied ? 2.5 : 0.6} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 6.9, 0.21]}>
          <planeGeometry args={[1.4, 0.7]} />
          <meshBasicMaterial map={number} toneMapped={false} />
        </mesh>
        {/* Invisible doorway so the whole frame is easy to click. */}
        <mesh position={[0, 3, 0]}>
          <boxGeometry args={[4.6, 6, 0.6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {crateMap &&
        Array.from({ length: crates }, (_, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2) % 2;
          const level = Math.floor(i / 4);
          return (
            <mesh
              key={i}
              geometry={GEO.crate}
              position={[stack.x + (col - 0.5) * 1.2, CRATE / 2 + level * CRATE, stack.z + (row - 0.5) * 1.2]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial map={crateMap} roughness={0.8} />
            </mesh>
          );
        })}
    </group>
  );
});
