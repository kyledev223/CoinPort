import { Canvas } from "@react-three/fiber";
import { useGameStore } from "@/store/gameStore";
import { Docks } from "./Docks";
import { Forklifts } from "./ForkliftModel";
import { Ground } from "./Ground";
import { GateFlash, LightPools, SceneLights } from "./Lighting";
import { COLORS } from "./palette";
import { StrategyControls, cameraStartPosition } from "./StrategyControls";
import { Structures } from "./Structures";
import { Trucks } from "./TruckModel";

// Stable object: R3F rebuilds the camera if these options change between renders.
const CAMERA = { fov: 32, near: 1, far: 700, position: cameraStartPosition() };

/** The 3D hub. Browser-only (WebGL); load it through HubView. Everything dynamic reads the game store. */
export default function HubCanvas() {
  return (
    <Canvas
      // PCF with a shadow radius gives soft edges; three r18x removed PCFSoftShadowMap.
      shadows="percentage"
      dpr={[1, 2]}
      camera={CAMERA}
      gl={{ antialias: true }}
      // A click (not a drag) on empty floor clears the selection.
      onPointerMissed={() => useGameStore.getState().select(null)}
    >
      <color attach="background" args={[COLORS.background]} />
      <fog attach="fog" args={[COLORS.background, 180, 380]} />
      <SceneLights />
      <LightPools />
      <GateFlash />
      <Ground />
      <Structures />
      <Docks />
      <Forklifts />
      <Trucks />
      <StrategyControls />
    </Canvas>
  );
}
