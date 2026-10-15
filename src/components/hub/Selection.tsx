import * as THREE from "three";
import { COLORS } from "./palette";

/** Pointer moves (px) above which a click counts as a drag and selects nothing. */
export const CLICK_SLOP = 5;
/** Selection outline width (m). */
const OUTLINE_WIDTH = 0.22;

const outlineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.amber, side: THREE.BackSide, toneMapped: false });
const ringGeometry = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const unitBox = new THREE.BoxGeometry(1, 1, 1);

/**
 * Inverted-hull outline for a box part: a slightly larger box showing only
 * its back faces, so just the rim around the real box stays visible.
 */
export function OutlineBox({ size, position }: { size: readonly [number, number, number]; position: readonly [number, number, number] }) {
  return (
    <mesh
      geometry={unitBox}
      material={outlineMaterial}
      position={position as [number, number, number]}
      scale={[size[0] + OUTLINE_WIDTH * 2, size[1] + OUTLINE_WIDTH * 2, size[2] + OUTLINE_WIDTH * 2]}
      raycast={() => null}
    />
  );
}

/** Glowing floor ring under a selected object, so the selection reads at any zoom. */
export function SelectionRing({ radius, z = 0 }: { radius: number; z?: number }) {
  return (
    <mesh geometry={ringGeometry} position={[0, 0.07, z]} scale={radius} renderOrder={2} raycast={() => null}>
      <meshBasicMaterial color={COLORS.amber} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
