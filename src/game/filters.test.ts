import { describe, expect, it } from "vitest";
import { NO_FILTERS, isFiltering, matchesTruckFilters } from "./filters";

const coin = { name: "FrogFuel", symbol: "FROG", creatorWallet: "WalletA" };

describe("matchesTruckFilters", () => {
  it("keeps everything with no filters", () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(matchesTruckFilters({ state: "docking" }, coin, NO_FILTERS, null)).toBe(true);
  });

  it("filters by lifecycle stage, grouping docking with arriving", () => {
    const f = { ...NO_FILTERS, stages: ["arriving" as const] };
    expect(matchesTruckFilters({ state: "docking" }, coin, f, null)).toBe(true);
    expect(matchesTruckFilters({ state: "stored" }, coin, f, null)).toBe(false);
  });

  it("searches name and ticker, ignoring case and a leading $", () => {
    for (const query of ["frog", "$FROG", "fuel", "  Fro "]) {
      expect(matchesTruckFilters({ state: "stored" }, coin, { ...NO_FILTERS, query }, null)).toBe(true);
    }
    expect(matchesTruckFilters({ state: "stored" }, coin, { ...NO_FILTERS, query: "cat" }, null)).toBe(false);
  });

  it("matches My coins against the connected wallet, and nothing without one", () => {
    const mine = { ...NO_FILTERS, mineOnly: true };
    expect(matchesTruckFilters({ state: "stored" }, coin, mine, "WalletA")).toBe(true);
    expect(matchesTruckFilters({ state: "stored" }, coin, mine, "WalletB")).toBe(false);
    expect(matchesTruckFilters({ state: "stored" }, coin, mine, null)).toBe(false);
  });
});
