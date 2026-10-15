import type { Coin } from "./types";

/** Receives coins that are new or changed since the last call, as full records keyed by `mint`. */
export type CoinChangeListener = (changed: readonly Coin[]) => void;
export type Unsubscribe = () => void;

/**
 * The game's only door to coin data. The game layer upserts whatever comes
 * through here by mint and never knows whether it is mock, replay or live.
 *
 * A live implementation (pump.fun / Solana indexer feed) maps its payloads to
 * `Coin` and implements the same three members.
 */
export interface CoinSource {
  /** True when coins are fabricated; the UI should say so. */
  readonly isSimulated: boolean;
  /** Snapshot of all coins the source currently knows about. */
  listCoins(): Promise<Coin[]>;
  /** Push updates after the snapshot: new launches and changed fields. */
  subscribe(onChange: CoinChangeListener): Unsubscribe;
}
