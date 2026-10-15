import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/game";
import { describeEvent } from "./feedText";

const base: ActivityEvent = {
  id: "x",
  kind: "arrived",
  at: 0,
  truckId: "truck:m",
  mint: "m",
  symbol: "FROG",
  zoneId: null,
  dockId: null,
};
const line = (e: Partial<ActivityEvent>) => {
  const d = describeEvent({ ...base, ...e });
  return d.ticker + d.text;
};

describe("describeEvent", () => {
  it("words events like the concept feed", () => {
    expect(line({ kind: "docked", dockId: "dock-3", zoneId: "launch-bay" })).toBe("$FROG arrived at Bay 3");
    expect(line({ kind: "stored", symbol: "CAT", zoneId: "storage-b", tier: 2 })).toBe("$CAT reached Storage B");
    expect(line({ kind: "graduated", symbol: "ROCKET", zoneId: "graduation-gate" })).toBe("$ROCKET graduated!");
  });

  it("says which way a tier move went", () => {
    expect(line({ kind: "tier_changed", zoneId: "storage-c", tier: 3, fromTier: 2 })).toBe("$FROG moved up to Storage C");
    expect(line({ kind: "tier_changed", zoneId: "storage-a", tier: 1, fromTier: 2 })).toBe("$FROG moved down to Storage A");
  });
});
