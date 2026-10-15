import { describe, expect, it } from "vitest";
import { lifecycleSteps, pumpFunUrl, shortAddress, solscanAccountUrl, solscanTokenUrl } from "./inspect";

describe("explorer links", () => {
  const mint = "So11111111111111111111111111111111111111112";

  it("add ?cluster=devnet only on devnet", () => {
    expect(pumpFunUrl({ mint, network: "devnet" })).toBe(`https://pump.fun/coin/${mint}?cluster=devnet`);
    expect(pumpFunUrl({ mint, network: "mainnet-beta" })).toBe(`https://pump.fun/coin/${mint}`);
    expect(solscanTokenUrl({ mint, network: "devnet" })).toBe(`https://solscan.io/token/${mint}?cluster=devnet`);
    expect(solscanTokenUrl({ mint, network: "mainnet-beta" })).toBe(`https://solscan.io/token/${mint}`);
    expect(solscanAccountUrl("abc", "devnet")).toBe("https://solscan.io/account/abc?cluster=devnet");
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
