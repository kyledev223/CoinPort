import "server-only";
import { PublicKey } from "@solana/web3.js";
import { curveStats } from "./curve";
import type { ChainReader } from "./launch/finalize";
import { pumpSdk } from "./pump";
import { withRpc } from "./rpc";

/** The pump Global account's initial real token reserves, cached for 10 minutes. */
let globalCache: { initialRealTokenReserves: { toString(): string }; at: number } | null = null;

export async function initialRealTokenReserves(): Promise<{ toString(): string }> {
  if (globalCache && Date.now() - globalCache.at < 10 * 60_000) return globalCache.initialRealTokenReserves;
  const sdk = pumpSdk();
  const info = await withRpc((c) => c.getAccountInfo(sdk.GLOBAL_PDA, "confirmed"));
  if (!info) throw new Error("pump Global account not found");
  const global = sdk.PUMP_SDK.decodeGlobal(info);
  globalCache = { initialRealTokenReserves: global.initialRealTokenReserves, at: Date.now() };
  return global.initialRealTokenReserves;
}

/** Bonding-curve accounts for many mints at once (100 per RPC call). */
export async function readCurves(mints: string[]): Promise<Map<string, { creator: string; stats: ReturnType<typeof curveStats>; graduated: boolean } | null>> {
  const sdk = pumpSdk();
  const out = new Map<string, { creator: string; stats: ReturnType<typeof curveStats>; graduated: boolean } | null>();
  if (mints.length === 0) return out;
  const initial = await initialRealTokenReserves();
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const pdas = chunk.map((m) => sdk.bondingCurvePda(new PublicKey(m)));
    const infos = await withRpc((c) => c.getMultipleAccountsInfo(pdas, "confirmed"));
    chunk.forEach((mint, k) => {
      const info = infos[k];
      const bc = info ? sdk.PUMP_SDK.decodeBondingCurveNullable(info) : null;
      out.set(
        mint,
        bc
          ? {
              creator: bc.creator.toBase58(),
              stats: curveStats({ ...bc, complete: bc.complete }, initial),
              graduated: sdk.isBondingCurveMigrated(bc),
            }
          : null,
      );
    });
  }
  return out;
}

export const rpcChainReader: ChainReader = {
  async signatureStatus(signature) {
    const { value } = await withRpc((c) => c.getSignatureStatuses([signature], { searchTransactionHistory: true }));
    const s = value[0];
    if (!s) return null;
    return { confirmed: s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized", err: s.err };
  },
  blockHeight() {
    return withRpc((c) => c.getBlockHeight("confirmed"));
  },
  async bondingCurve(mint) {
    return (await readCurves([mint])).get(mint) ?? null;
  },
};
