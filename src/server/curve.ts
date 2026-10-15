/**
 * Bonding-curve maths, on plain integers so it can be tested without the SDK.
 *   market cap (SOL) = supply × virtualSolReserves / virtualTokenReserves
 *   curve progress   = 1 − realTokenReserves / initialRealTokenReserves
 */

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Anything with a decimal toString(): bn.js BN, bigint, number. */
type IntLike = { toString(): string } | bigint | number;
const big = (v: IntLike) => BigInt(v.toString());

export interface CurveReserves {
  virtualTokenReserves: IntLike;
  /** Virtual SOL reserves (the SDK calls them "quote" reserves). */
  virtualQuoteReserves: IntLike;
  realTokenReserves: IntLike;
  tokenTotalSupply: IntLike;
  complete: boolean;
}

export interface CurveStats {
  marketCapSol: number;
  curveProgress: number;
  complete: boolean;
}

export function marketCapSol(c: Pick<CurveReserves, "virtualTokenReserves" | "virtualQuoteReserves" | "tokenTotalSupply">): number {
  const vTok = big(c.virtualTokenReserves);
  if (vTok === 0n) return 0;
  // Keep 9 decimals of SOL precision in integer maths, then convert.
  const lamports = (big(c.tokenTotalSupply) * big(c.virtualQuoteReserves)) / vTok;
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

export function curveProgress(c: Pick<CurveReserves, "realTokenReserves" | "complete">, initialRealTokenReserves: IntLike): number {
  if (c.complete) return 1;
  const initial = big(initialRealTokenReserves);
  if (initial === 0n) return 0;
  const left = big(c.realTokenReserves);
  // Basis points in integers, then a fraction.
  const sold = Number(((initial - left) * 10_000n) / initial) / 10_000;
  return Math.min(1, Math.max(0, sold));
}

export function curveStats(c: CurveReserves, initialRealTokenReserves: IntLike): CurveStats {
  return { marketCapSol: marketCapSol(c), curveProgress: curveProgress(c, initialRealTokenReserves), complete: c.complete };
}
