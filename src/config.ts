import type { Network } from "@/game";

/**
 * The app's Solana network: the one value the network badge, mock coins and
 * explorer links all read. Set NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta to switch.
 */
export const APP_NETWORK: Network =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet";
