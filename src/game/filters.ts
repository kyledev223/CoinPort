/** Which trucks the HUD filters keep at full opacity. Pure. */

import { stageOf, type LifecycleStage } from "./inspect";
import type { Coin, Truck } from "./types";

export interface TruckFilters {
  /** Lifecycle stages to keep; empty keeps all. */
  stages: LifecycleStage[];
  /** Keep only coins created by the connected wallet. */
  mineOnly: boolean;
  /** Matches name or ticker, case-insensitive; a leading "$" is ignored. */
  query: string;
}

export const NO_FILTERS: TruckFilters = { stages: [], mineOnly: false, query: "" };

export function isFiltering(f: TruckFilters): boolean {
  return f.stages.length > 0 || f.mineOnly || f.query.trim() !== "";
}

export function matchesTruckFilters(
  truck: Pick<Truck, "state">,
  coin: Pick<Coin, "name" | "symbol" | "creatorWallet"> | undefined,
  f: TruckFilters,
  wallet: string | null,
): boolean {
  if (f.stages.length > 0 && !f.stages.includes(stageOf(truck.state))) return false;
  if (f.mineOnly && (!wallet || coin?.creatorWallet !== wallet)) return false;
  const q = f.query.trim().replace(/^\$/, "").toLowerCase();
  if (q && !(coin && (coin.symbol.toLowerCase().includes(q) || coin.name.toLowerCase().includes(q)))) return false;
  return true;
}
