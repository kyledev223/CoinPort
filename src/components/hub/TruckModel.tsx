import { useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { matchesTruckFilters, sampleMotion, type TruckId } from "@/game";
import { selectCoinForTruck, selectIsSelected, useGameStore } from "@/store/gameStore";
import { COLORS, coinColor } from "./palette";
import { useConnectedWallet } from "@/wallet/useConnectedWallet";
import { CLICK_SLOP, OutlineBox, SelectionRing, setGroupOpacity } from "./Selection";
import { labelTexture, useCoinTexture } from "./textures";

// Truck dimensions (metres). The nose points along local -z, so yaw 0 faces north.
const TRAILER = { width: 2.5, height: 2.8, length: 5.2, z: 0.9, y: 2.5 };
const CAB = { width: 2.4, height: 2.3, length: 2.0, z: -2.55, y: 1.95 };
const REAR_Z = TRAILER.z + TRAILER.length / 2;
const NOSE_Z = CAB.z - CAB.length / 2;
const LOGO_SIZE = 2.3;
const WHEELS: Array<[number, number]> = [-2.7, 1.6, 2.7].flatMap((z) => [
  [-1.08, z],
  [1.08, z],
]);

// Shared by every truck; R3F leaves geometries passed as props alone on unmount.
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cab: new THREE.BoxGeometry(CAB.width, CAB.height, CAB.length),
  trailer: new THREE.BoxGeometry(TRAILER.width, TRAILER.height, TRAILER.length),
  wheel: new THREE.CylinderGeometry(0.48, 0.48, 0.42, 12).rotateZ(Math.PI / 2),
  logo: new THREE.PlaneGeometry(LOGO_SIZE, LOGO_SIZE),
  plate: new THREE.PlaneGeometry(2.2, 0.74),
};

/** Opacity of trucks the HUD filters leave out: faded, not hidden. */
const DIMMED_OPACITY = 0.14;
const FADE_RATE = 8;

/** Every truck in the store. */
export function Trucks() {
  const ids = useGameStore(useShallow((s) => s.world.trucks.map((t) => t.id)));
  return (
    <>
      {ids.map((id) => (
        <TruckModel key={id} id={id} />
      ))}
    </>
  );
}

/** One truck: placed each frame from its planned motion, clickable. */
const TruckModel = memo(function TruckModel({ id }: { id: TruckId }) {
  const group = useRef<THREE.Group>(null);
  const motion = useGameStore((s) => s.world.motions[id]);
  const coin = useGameStore(selectCoinForTruck(id));
  const selected = useGameStore(selectIsSelected("truck", id));
  const select = useGameStore((s) => s.select);
  const wallet = useConnectedWallet();
  const dimmed = useGameStore((s) => {
    const t = s.truckIndex[id];
    return t ? !matchesTruckFilters(t, s.coins[t.mint], s.filters, wallet) : false;
  });
  const opacity = useRef(1);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g || !motion) return;
    const pose = sampleMotion(motion, Date.now());
    g.position.set(pose.x, 0, pose.z);
    g.rotation.y = pose.yaw;
    g.visible = true;

    const target = dimmed ? DIMMED_OPACITY : 1;
    if (opacity.current !== target) {
      const next = opacity.current + (target - opacity.current) * (1 - Math.exp(-FADE_RATE * Math.min(delta, 0.1)));
      opacity.current = Math.abs(next - target) < 0.005 ? target : next;
      setGroupOpacity(g, opacity.current);
    }
  });

  const symbol = coin?.symbol ?? "???";
  const colors = useMemo(
    () => ({ trailer: coinColor(symbol, 55, 36), cab: coinColor(symbol, 45, 22), stripe: coinColor(symbol, 80, 60) }),
    [symbol],
  );

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    select({ kind: "truck", id });
  };

  return (
    <group
      ref={group}
      visible={false}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {selected && <SelectionRing radius={5} />}
      <mesh geometry={GEO.box} position={[0, 0.78, -0.1]} scale={[2.2, 0.32, 7]} castShadow>
        <meshStandardMaterial color="#14171c" roughness={0.8} />
      </mesh>
      <mesh geometry={GEO.cab} position={[0, CAB.y, CAB.z]} castShadow receiveShadow>
        <meshStandardMaterial color={colors.cab} roughness={0.45} metalness={0.35} />
      </mesh>
      {selected && <OutlineBox size={[CAB.width, CAB.height, CAB.length]} position={[0, CAB.y, CAB.z]} />}
      <mesh geometry={GEO.box} position={[0, CAB.y + 0.45, NOSE_Z - 0.01]} scale={[2.1, 0.85, 0.04]}>
        <meshStandardMaterial color={COLORS.glass} roughness={0.15} metalness={0.6} emissive="#20344d" emissiveIntensity={0.5} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} geometry={GEO.box} position={[x, 1.25, NOSE_Z - 0.02]} scale={[0.45, 0.22, 0.05]}>
          <meshStandardMaterial color={COLORS.bulb} emissive={COLORS.bulb} emissiveIntensity={4} toneMapped={false} />
        </mesh>
      ))}
      <mesh geometry={GEO.trailer} position={[0, TRAILER.y, TRAILER.z]} castShadow receiveShadow>
        <meshStandardMaterial color={colors.trailer} roughness={0.55} metalness={0.25} />
      </mesh>
      {selected && <OutlineBox size={[TRAILER.width, TRAILER.height, TRAILER.length]} position={[0, TRAILER.y, TRAILER.z]} />}
      <mesh
        geometry={GEO.box}
        position={[0, TRAILER.y - TRAILER.height / 2 + 0.12, TRAILER.z]}
        scale={[TRAILER.width + 0.04, 0.12, TRAILER.length]}
      >
        <meshStandardMaterial color={colors.stripe} emissive={colors.stripe} emissiveIntensity={0.6} />
      </mesh>
      <TrailerLogos imageUrl={coin?.imageUrl ?? ""} symbol={symbol} color={colors.trailer} />
      <TickerPlate symbol={symbol} />
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} geometry={GEO.box} position={[x, 1.3, REAR_Z + 0.02]} scale={[0.35, 0.2, 0.04]}>
          <meshStandardMaterial color={COLORS.taillight} emissive={COLORS.taillight} emissiveIntensity={3} toneMapped={false} />
        </mesh>
      ))}
      {WHEELS.map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={GEO.wheel} position={[x, 0.48, z]} castShadow>
          <meshStandardMaterial color={COLORS.tire} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
});

/** Coin image on both trailer sides; a coloured ticker plate while loading or if the image can't be used. */
function TrailerLogos({ imageUrl, symbol, color }: { imageUrl: string; symbol: string; color: string }) {
  const image = useCoinTexture(imageUrl);
  const fallback = useMemo(
    () => labelTexture({ text: symbol, background: color, color: "#ffffff", border: "#ffffff55", width: 256, height: 256 }),
    [symbol, color],
  );
  const map = image ?? fallback;
  const sideX = TRAILER.width / 2 + 0.02;
  return (
    <>
      {[1, -1].map((side) => (
        <mesh key={side} geometry={GEO.logo} position={[side * sideX, TRAILER.y, TRAILER.z]} rotation-y={(side * Math.PI) / 2}>
          <meshBasicMaterial map={map} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function TickerPlate({ symbol }: { symbol: string }) {
  const map = useMemo(
    () => labelTexture({ text: symbol, background: "#0c1016", color: COLORS.amber, border: COLORS.amber, width: 384, height: 128 }),
    [symbol],
  );
  return (
    <mesh geometry={GEO.plate} position={[0, TRAILER.y + 0.4, REAR_Z + 0.02]}>
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}
