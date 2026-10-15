import { describe, expect, it } from "vitest";
import { parseHttpsUrl, parseMint, parseNetwork, projectPumpFunUrl } from "./config";

describe("parseNetwork", () => {
  it("reads both mainnet spellings, in any case", () => {
    for (const v of ["mainnet", "mainnet-beta", " MAINNET ", "Mainnet-Beta"]) expect(parseNetwork(v)).toBe("mainnet-beta");
  });

  it("defaults to devnet", () => {
    for (const v of [undefined, "", "devnet", "testnet"]) expect(parseNetwork(v)).toBe("devnet");
  });
});

describe("project links", () => {
  const mint = "So11111111111111111111111111111111111111112";

  it("accepts a base58 contract address and rejects anything else", () => {
    expect(parseMint(` ${mint} `)).toBe(mint);
    expect(parseMint(undefined)).toBeNull();
    expect(parseMint("")).toBeNull();
    expect(parseMint("0x1234abcd")).toBeNull(); // not base58
    expect(parseMint("short")).toBeNull();
  });

  it("accepts https links only", () => {
    expect(parseHttpsUrl("https://x.com/coinport")).toBe("https://x.com/coinport");
    expect(parseHttpsUrl("http://x.com/coinport")).toBeNull();
    expect(parseHttpsUrl("x.com/coinport")).toBeNull();
    expect(parseHttpsUrl(undefined)).toBeNull();
  });

  it("links the token to its pump.fun page", () => {
    expect(projectPumpFunUrl(mint)).toBe(`https://pump.fun/coin/${mint}`);
  });
});
