import type { Network } from "@/game";

/** "mainnet" or "mainnet-beta" (any case) → mainnet; anything else, including unset, → devnet. */
export function parseNetwork(value: string | undefined): Network {
  const v = value?.trim().toLowerCase();
  return v === "mainnet" || v === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

/**
 * The app's Solana network: the one value the network badge, mock coins and
 * explorer links all read. Set NEXT_PUBLIC_SOLANA_NETWORK=mainnet to switch.
 */
export const APP_NETWORK: Network = parseNetwork(process.env.NEXT_PUBLIC_SOLANA_NETWORK);
