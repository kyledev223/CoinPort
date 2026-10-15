/** Camera framings for the HUD's district selector. */

import { ZONES } from "./layout";

export type DistrictId = "launch-bay" | "storage" | "graduation-gate";

export interface District {
  id: DistrictId;
  label: string;
  /** Floor point the camera looks at. */
  x: number;
  z: number;
  /** Camera distance from that point (m). */
  distance: number;
}

const storageCenterX = (ZONES["storage-a"].center.x + ZONES["storage-c"].center.x) / 2;

export const DISTRICTS: readonly District[] = [
  { id: "launch-bay", label: "Launch Bay", x: ZONES["launch-bay"].center.x, z: ZONES["launch-bay"].center.z + 6, distance: 75 },
  { id: "storage", label: "Storage", x: storageCenterX, z: ZONES["storage-a"].center.z + 2, distance: 105 },
  { id: "graduation-gate", label: "Graduation Gate", x: ZONES["graduation-gate"].center.x, z: ZONES["graduation-gate"].center.z, distance: 70 },
];
