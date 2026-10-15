"use client";

import { WalletNotReadyError, type Adapter, type WalletError } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletProvider } from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useMemo, type ReactNode } from "react";
import { useWalletUi } from "./walletUi";

/**
 * Wallet connection for the whole app: Phantom and Solflare, plus OKX Wallet
 * and any other installed Wallet Standard wallet the adapter detects. The browser never
 * needs its own Solana RPC: the server builds, simulates and relays launches.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  const onError = (error: WalletError, adapter?: Adapter) => {
    // Picking a wallet that isn't installed: show install steps rather than just a download page.
    if (error instanceof WalletNotReadyError) {
      useWalletUi.getState().showHelp(adapter?.name ?? "Phantom");
      return;
    }
    console.warn("[coinport] wallet error:", error.name, error.message);
  };

  return (
    <WalletProvider wallets={wallets} autoConnect onError={onError}>
      {children}
    </WalletProvider>
  );
}
