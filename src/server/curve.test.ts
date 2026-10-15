import { describe, expect, it } from "vitest";
import { curveProgress, curveStats, marketCapSol } from "./curve";

// pump.fun's starting curve: 1B supply (6 decimals), 1.073B virtual tokens, 30 virtual SOL,
// 793.1M tokens sold on the curve.
const SUPPLY = 1_000_000_000_000_000n;
const V_TOKENS = 1_073_000_000_000_000n;
const V_SOL = 30_000_000_000n;
const INITIAL_REAL_TOKENS = 793_100_000_000_000n;

const fresh = { virtualTokenReserves: V_TOKENS, virtualQuoteReserves: V_SOL, realTokenReserves: INITIAL_REAL_TOKENS, tokenTotalSupply: SUPPLY, complete: false };

describe("bonding curve maths", () => {
  it("prices a fresh coin at about 28 SOL with no progress", () => {
    expect(marketCapSol(fresh)).toBeCloseTo(27.96, 2);
    expect(curveProgress(fresh, INITIAL_REAL_TOKENS)).toBe(0);
  });

  it("follows the constant product as tokens are bought", () => {
    // Half the curve sold: real reserves halve; virtual reserves keep x·y = k.
    const sold = INITIAL_REAL_TOKENS / 2n;
    const vTok = V_TOKENS - sold;
    const vSol = (V_TOKENS * V_SOL) / vTok;
    const half = { ...fresh, virtualTokenReserves: vTok, virtualQuoteReserves: vSol, realTokenReserves: INITIAL_REAL_TOKENS - sold };
    expect(curveProgress(half, INITIAL_REAL_TOKENS)).toBeCloseTo(0.5, 4);
    expect(marketCapSol(half)).toBeCloseTo(Number((SUPPLY * vSol) / vTok) / 1e9, 6);
  });

  it("is complete at 100%, and safe on empty reserves", () => {
    expect(curveStats({ ...fresh, realTokenReserves: 0n, complete: true }, INITIAL_REAL_TOKENS)).toMatchObject({ curveProgress: 1, complete: true });
    expect(marketCapSol({ ...fresh, virtualTokenReserves: 0n })).toBe(0);
    expect(curveProgress(fresh, 0n)).toBe(0);
  });

  it("accepts bn.js-style values", () => {
    const bnLike = (v: bigint) => ({ toString: () => v.toString() });
    expect(marketCapSol({ virtualTokenReserves: bnLike(V_TOKENS), virtualQuoteReserves: bnLike(V_SOL), tokenTotalSupply: bnLike(SUPPLY) })).toBeCloseTo(27.96, 2);
  });
});
