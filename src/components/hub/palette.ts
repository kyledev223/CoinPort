import type { StorageTier } from "@/game";

/** Night-time logistics palette from the concept art: near-black steel with amber light. */
export const COLORS = {
  background: "#06090e",
  floor: "#151b24",
  pad: "#1d2430",
  padEdge: "#e8a42c",
  wall: "#2c3440",
  roof: "#222a35",
  steel: "#56606e",
  beam: "#353e4b",
  amber: "#ffb13b",
  amberHot: "#ff8c1a",
  bulb: "#ffd68a",
  glass: "#1d2a3a",
  tire: "#0b0d10",
  chrome: "#8a94a3",
  taillight: "#ff3b2f",
  forklift: "#f2a516",
} as const;

/** Crate colours per storage tier: green Discovery, orange Growth, blue Elite. */
export const TIER_CRATE_COLORS: Record<StorageTier, readonly string[]> = {
  1: ["#3fae4a", "#2f8f3a", "#58c463"],
  2: ["#e8892a", "#c96d1b", "#f2a04b"],
  3: ["#3f7fe0", "#2e63b8", "#5a96f0"],
};

/** Stable 0–359 hue from any string (FNV-1a). */
export function hueFor(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

export function coinColor(key: string, saturation = 62, lightness = 42): string {
  return `hsl(${hueFor(key)}, ${saturation}%, ${lightness}%)`;
}
