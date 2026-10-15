import { describe, expect, it } from "vitest";
import { parseNetwork } from "./config";

describe("parseNetwork", () => {
  it("reads both mainnet spellings, in any case", () => {
    for (const v of ["mainnet", "mainnet-beta", " MAINNET ", "Mainnet-Beta"]) expect(parseNetwork(v)).toBe("mainnet-beta");
  });

  it("defaults to devnet", () => {
    for (const v of [undefined, "", "devnet", "testnet"]) expect(parseNetwork(v)).toBe("devnet");
  });
});
