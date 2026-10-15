"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { ApiCoinSource } from "@/coins/apiCoinSource";
import { createLaunchHandler } from "@/launch/launchFlow";
import { useGameStore } from "@/store/gameStore";
import { WalletDialogs } from "@/wallet/WalletDialogs";
import { WalletProviders } from "@/wallet/WalletProviders";
import { Hud } from "./hud/Hud";

// WebGL needs the browser, so the canvas skips server rendering.
const HubCanvas = dynamic(() => import("./hub/HubCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-display text-sm tracking-[0.3em] text-amber-400/70">
      LOADING HUB…
    </div>
  ),
});

/**
 * The composition root: wallet providers, the live coin feed, the real launch
 * flow, the 3D hub and the HUD. The game and the scene only see a CoinSource
 * and the onLaunch prop; wallet and API code stay out here.
 */
export function HubView() {
  return (
    <WalletProviders>
      <Hub />
    </WalletProviders>
  );
}

function Hub() {
  const wallet = useWallet();
  // A launch uses the wallet that was connected when it started.
  const onLaunch = useMemo(() => createLaunchHandler(() => wallet), [wallet]);

  useEffect(() => {
    // Development only (dropped from production builds): lets scripted checks
    // plug a CoinSource into the store (e.g. the 200-truck stress test).
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __coinport?: Record<string, unknown> };
      w.__coinport = { ...w.__coinport, store: useGameStore };
    }
    // Coins launched through CoinPort, finalized in the database.
    return useGameStore.getState().connect(new ApiCoinSource());
  }, []);

  return (
    <div className="relative h-full w-full select-none overscroll-none">
      <HubCanvas />
      <Hud onLaunch={onLaunch} />
      <WalletDialogs />
    </div>
  );
}
