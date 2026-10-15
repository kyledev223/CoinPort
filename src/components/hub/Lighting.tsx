import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { GRADUATION_ARCH_Z, ZONES } from "@/game";
import { useGameStore } from "@/store/gameStore";
import { COLORS } from "./palette";
import { glowTexture } from "./textures";

/** Cool night fill plus one warm shadow-casting key light over the whole hub. */
export function SceneLights() {
  return (
    <>
      <hemisphereLight args={["#6a7ca3", "#1a1e26", 1.5]} />
      <ambientLight color="#6c7fa6" intensity={0.35} />
      <directionalLight
        position={[70, 110, 60]}
        color="#ffe3bd"
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={5}
      />
    </>
  );
}

/** Amber pools of light under the Launch Bay and the Graduation Gate. */
export function LightPools() {
  const bay = ZONES["launch-bay"];
  const grad = ZONES["graduation-gate"];
  const entry = ZONES["entry-gate"];
  return (
    <>
      <PoolSpot position={[bay.center.x, 22, bay.center.z + 20]} target={[bay.center.x, 0, bay.center.z + 8]} intensity={2600} />
      <pointLight position={[bay.center.x, 7.5, bay.center.z - 2]} color={COLORS.amber} intensity={260} distance={34} decay={2} />
      <FloorGlow x={bay.center.x} z={bay.center.z + 9} width={bay.size.width + 14} depth={bay.size.depth + 6} opacity={0.5} />

      <PoolSpot position={[grad.center.x, 22, grad.center.z + 10]} target={[grad.center.x, 0, grad.center.z]} intensity={2200} />
      <FloorGlow x={grad.center.x} z={grad.center.z} width={grad.size.width + 14} depth={grad.size.depth + 12} opacity={0.55} />

      <FloorGlow x={entry.center.x} z={entry.center.z} width={entry.size.width + 6} depth={entry.size.depth + 4} opacity={0.18} />
    </>
  );
}

function PoolSpot({ position, target, intensity }: { position: [number, number, number]; target: [number, number, number]; intensity: number }) {
  const light = useRef<THREE.SpotLight>(null);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(...target);
    l.target.updateMatrixWorld();
  }, [target]);
  return (
    <spotLight
      ref={light}
      position={position}
      color={COLORS.amber}
      intensity={intensity}
      distance={70}
      angle={0.75}
      penumbra={0.9}
      decay={1.8}
    />
  );
}

/** Additive radial glow on the floor that sells the light pool from far away. */
function FloorGlow({ x, z, width, depth, opacity }: { x: number; z: number; width: number; depth: number; opacity: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, 0.05, z]} renderOrder={1}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        map={glowTexture()}
        color={COLORS.amberHot}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** 0–1 brightness of a flash `dt` ms after a truck crosses the gate: quick rise, ~1.2 s fade. */
function flashLevel(dt: number): number {
  if (dt < -250 || dt > 1400) return 0;
  return dt < 0 ? 1 + dt / 250 : Math.pow(1 - dt / 1400, 2);
}

/** Short amber burst under the Graduation Gate whenever a departing truck drives through. */
export function GateFlash() {
  const flashes = useGameStore((s) => s.world.gateFlashes);
  const light = useRef<THREE.PointLight>(null);
  const curtain = useRef<THREE.MeshBasicMaterial>(null);
  const floor = useRef<THREE.MeshBasicMaterial>(null);
  const { center, size } = ZONES["graduation-gate"];

  useFrame(() => {
    const now = Date.now();
    const level = flashes.reduce((k, t) => Math.max(k, flashLevel(now - t)), 0);
    if (light.current) light.current.intensity = level * 3000;
    if (curtain.current) curtain.current.opacity = level * 0.45;
    if (floor.current) floor.current.opacity = level * 0.9;
  });

  return (
    <group position={[center.x, 0, GRADUATION_ARCH_Z]}>
      <pointLight ref={light} position={[0, 5, 0]} color={COLORS.amber} intensity={0} distance={40} decay={1.6} />
      <mesh position={[0, 3.8, 0]}>
        <planeGeometry args={[size.width, 7.6]} />
        <meshBasicMaterial
          ref={curtain}
          color={COLORS.amberHot}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <planeGeometry args={[size.width + 10, 14]} />
        <meshBasicMaterial
          ref={floor}
          map={glowTexture()}
          color={COLORS.amber}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
