/** The hub's forklift fleet: equipment, not coin data. */

import { ZONES, slotPosition } from "./layout";
import type { Forklift } from "./types";

const forklift = (n: number, zoneId: Forklift["zoneId"], position: Forklift["position"], task: Forklift["task"]): Forklift => ({
  id: `forklift-${n}`,
  zoneId,
  position,
  task,
  truckId: null,
});

/**
 * The six forklifts at their home posts: four Launch Bay crew (they unload
 * docked trucks) parked on the open floor in front of the back shelving, and
 * two stacking in the storage halls.
 */
export function createForklifts(): Forklift[] {
  const bay = ZONES["launch-bay"].center;
  const crewPost = (dx: number) => ({ x: bay.x + dx, y: 0, z: bay.z - 3 });
  return [
    forklift(1, "launch-bay", crewPost(-12), "idle"),
    forklift(2, "launch-bay", crewPost(-4), "idle"),
    forklift(3, "launch-bay", crewPost(4), "idle"),
    forklift(4, "launch-bay", crewPost(12), "idle"),
    forklift(5, "storage-b", slotPosition("storage-b", 4), "stacking"),
    forklift(6, "storage-c", slotPosition("storage-c", 3), "stacking"),
  ];
}
