import { useWallet } from "@solana/wallet-adapter-react";

/** The connected wallet's address, or null when none is connected. */
export function useConnectedWallet(): string | null {
  return useWallet().publicKey?.toBase58() ?? null;
}
