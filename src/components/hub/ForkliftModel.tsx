import { useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { forkliftPose, type ForkliftId } from "@/game";
import { selectIsSelected, useGameStore } from "@/store/gameStore";
import { COLORS } from "./palette";
import { CLICK_SLOP, OutlineBox, SelectionRing } from "./Selection";
import { acquireCrateTexture, releaseCrateTexture } from "./textures";

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  body: new THREE.BoxGeometry(1.3, 0.9, 1.9),
  guard: new THREE.BoxGeometry(1.25, 0.08, 1.2),
  wheel: new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10).rotateZ(Math.PI / 2),
};

const PLAIN_CRATE = "#b98a4a";

/** Fork travel from floor to top (m). */
const FORK_TRAVEL = 1.6;

export function Forklifts() {
  const ids = useGameStore(useShallow((s) => s.world.forklifts.map((f) => f.id)));
  return (
    <>
      {ids.map((id) => (
        <ForkliftModel key={id} id={id} />
      ))}
    </>
  );
}

/** Low-poly forklift posed each frame from the store; carries a ticker-stamped crate while unloading. */
const ForkliftModel = memo(function ForkliftModel({ id }: { id: ForkliftId }) {
  const body = useRef<THREE.Group>(null);
  const forks = useRef<THREE.Group>(null);
  const crate = useRef<THREE.Mesh>(null);
  const forklift = useGameStore((s) => s.world.forklifts.find((f) => f.id === id));
  const motion = useGameStore((s) => s.world.forkliftMotions[id]);
  const cargoSymbol = useGameStore((s) => {
    const f = s.world.forklifts.find((x) => x.id === id);
    const truck = f?.truckId ? s.truckIndex[f.truckId] : undefined;
    return truck ? (s.coins[truck.mint]?.symbol ?? "") : "";
  });
  const selected = useGameStore(selectIsSelected("forklift", id));
  const select = useGameStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const crateMaterial = useRef<THREE.MeshStandardMaterial>(null);

  // Stamp the carried crate with the truck's ticker; the shared texture is released when the job ends.
  useEffect(() => {
    const m = crateMaterial.current;
    if (!m || !cargoSymbol) return;
    m.map = acquireCrateTexture(cargoSymbol);
    m.color.set("#ffffff");
    m.needsUpdate = true;
    return () => {
      m.map = null;
      m.color.set(PLAIN_CRATE);
      m.needsUpdate = true;
      releaseCrateTexture(cargoSymbol);
    };
  }, [cargoSymbol]);

  useFrame(() => {
    if (!forklift || !motion || !body.current || !forks.current) return;
    const pose = forkliftPose(forklift, motion, Date.now());
    body.current.position.set(pose.x, 0, pose.z);
    body.current.rotation.y = pose.yaw;
    body.current.visible = true;
    forks.current.position.y = 0.35 + pose.lift * FORK_TRAVEL;
    if (crate.current) crate.current.visible = pose.carrying;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    select({ kind: "forklift", id });
  };

  return (
    <group
      ref={body}
      visible={false}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {selected && <SelectionRing radius={2.4} z={-0.3} />}
      <mesh geometry={GEO.body} position={[0, 0.75, 0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={COLORS.forklift} roughness={0.5} metalness={0.2} />
      </mesh>
      {selected && <OutlineBox size={[1.3, 0.9, 1.9]} position={[0, 0.75, 0.2]} />}
      <mesh geometry={GEO.box} position={[0, 0.85, 1.05]} scale={[1.25, 0.8, 0.35]} castShadow>
        <meshStandardMaterial color="#1a1d22" roughness={0.7} />
      </mesh>
      {[
        [-0.55, -0.3],
        [0.55, -0.3],
        [-0.55, 0.75],
        [0.55, 0.75],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={GEO.box} position={[x, 1.75, z]} scale={[0.08, 1.1, 0.08]}>
          <meshStandardMaterial color="#1a1d22" />
        </mesh>
      ))}
      <mesh geometry={GEO.guard} position={[0, 2.32, 0.22]} castShadow>
        <meshStandardMaterial color="#1a1d22" />
      </mesh>
      {selected && <OutlineBox size={[1.25, 0.08, 1.2]} position={[0, 2.32, 0.22]} />}
      <mesh geometry={GEO.box} position={[0, 2.42, 0.22]} scale={[0.3, 0.1, 0.3]}>
        <meshStandardMaterial color={COLORS.amberHot} emissive={COLORS.amberHot} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} geometry={GEO.box} position={[x, 1.5, -0.82]} scale={[0.12, 2.9, 0.12]} castShadow>
          <meshStandardMaterial color={COLORS.steel} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group ref={forks} position={[0, 0.35, 0]}>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} geometry={GEO.box} position={[x, 0, -1.45]} scale={[0.12, 0.06, 1.2]}>
            <meshStandardMaterial color={COLORS.steel} metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh ref={crate} geometry={GEO.box} position={[0, 0.5, -1.45]} scale={[1, 0.9, 1]} castShadow visible={false}>
          <meshStandardMaterial ref={crateMaterial} color={PLAIN_CRATE} roughness={0.8} />
        </mesh>
      </group>
      {[
        [-0.62, -0.45],
        [0.62, -0.45],
        [-0.62, 0.85],
        [0.62, 0.85],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={GEO.wheel} position={[x, 0.3, z]}>
          <meshStandardMaterial color={COLORS.tire} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
});
