import { describe, expect, it } from "vitest";
import { lifecycleSteps, pumpFunUrl, shortAddress, solscanAccountUrl, solscanTokenUrl } from "./inspect";

describe("explorer links", () => {
  const mint = "So11111111111111111111111111111111111111112";

  it("link to mainnet pages", () => {
    expect(pumpFunUrl({ mint })).toBe(`https://pump.fun/coin/${mint}`);
    expect(solscanTokenUrl({ mint })).toBe(`https://solscan.io/token/${mint}`);
    expect(solscanAccountUrl("abc")).toBe("https://solscan.io/account/abc");
  });

  it("shortens addresses", () => {
    expect(shortAddress(mint)).toBe("So11…1112");
    expect(shortAddress("short")).toBe("short");
  });
});

describe("lifecycleSteps", () => {
  it("marks done, current and pending steps with known times", () => {
    const steps = lifecycleSteps({ state: "unloading" }, { arriving: 100, docking: 200, unloading: 300 });
    expect(steps.map((s) => [s.label, s.status, s.at])).toEqual([
      ["Arriving", "done", 100],
      ["Unloading", "current", 300],
      ["Stored", "pending", null],
      ["Hauling", "pending", null],
      ["Graduated", "pending", null],
    ]);
  });

  it("counts docking as arriving and departed as graduated", () => {
    expect(lifecycleSteps({ state: "docking" }, {})[0].status).toBe("current");
    expect(lifecycleSteps({ state: "departed" }, {})[4].status).toBe("current");
  });
});
