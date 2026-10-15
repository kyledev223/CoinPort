import type { Coin } from "./types";

/** Receives coins that are new or changed since the last call, as full records keyed by `mint`. */
export type CoinChangeListener = (changed: readonly Coin[]) => void;
export type Unsubscribe = () => void;

/**
 * The game's only door to coin data. The game layer upserts whatever comes
 * through here by mint and never knows where it comes from.
 *
 * A live implementation (e.g. the site's own launches from the database, or a
 * pump.fun / Solana indexer feed) maps its payloads to `Coin` and implements
 * these two members.
 */
export interface CoinSource {
  /** Snapshot of all coins the source currently knows about. */
  listCoins(): Promise<Coin[]>;
  /** Push updates after the snapshot: new launches and changed fields. */
  subscribe(onChange: CoinChangeListener): Unsubscribe;
}
