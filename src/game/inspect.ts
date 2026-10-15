/** Pure helpers for the inspect panel: explorer links, address shortening, lifecycle stepper. */

import type { Coin, Truck, TruckState } from "./types";
import type { TruckHistory } from "./world";

export function shortAddress(address: string, chars = 4): string {
  return address.length <= chars * 2 + 1 ? address : `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function pumpFunUrl(coin: Pick<Coin, "mint">): string {
  return `https://pump.fun/coin/${coin.mint}`;
}

export function solscanTokenUrl(coin: Pick<Coin, "mint">): string {
  return `https://solscan.io/token/${coin.mint}`;
}

export function solscanAccountUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}

export type StepStatus = "done" | "current" | "pending";

/** The five player-facing stages; each groups one or more truck states. */
export type LifecycleStage = "arriving" | "unloading" | "stored" | "hauling" | "graduated";

export const LIFECYCLE_STAGES: ReadonlyArray<{ stage: LifecycleStage; label: string; states: readonly TruckState[] }> = [
  { stage: "arriving", label: "Arriving", states: ["arriving", "docking"] },
  { stage: "unloading", label: "Unloading", states: ["unloading"] },
  { stage: "stored", label: "Stored", states: ["stored"] },
  { stage: "hauling", label: "Hauling", states: ["hauling"] },
  { stage: "graduated", label: "Graduated", states: ["graduated", "departed"] },
];

export function stageOf(state: TruckState): LifecycleStage {
  return LIFECYCLE_STAGES.find((s) => s.states.includes(state))!.stage;
}

export interface LifecycleStep {
  stage: LifecycleStage;
  label: string;
  status: StepStatus;
  /** When the truck entered this step, if seen. */
  at: number | null;
}

export function lifecycleSteps(truck: Pick<Truck, "state">, history: TruckHistory): LifecycleStep[] {
  const current = LIFECYCLE_STAGES.findIndex((s) => s.states.includes(truck.state));
  return LIFECYCLE_STAGES.map((step, i) => {
    const times = step.states.map((s) => history[s]).filter((t): t is number => t !== undefined);
    return {
      stage: step.stage,
      label: step.label,
      status: i < current ? "done" : i === current ? "current" : "pending",
      at: times.length ? Math.min(...times) : null,
    };
  });
}
