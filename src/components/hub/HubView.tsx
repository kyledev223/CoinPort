"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { Hud } from "../hud/Hud";
import type { OnLaunch } from "../launch/LaunchCoinDialog";

// WebGL needs the browser, so the canvas skips server rendering.
const HubCanvas = dynamic(() => import("./HubCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-display text-sm tracking-[0.3em] text-amber-400/70">
      LOADING HUB…
    </div>
  ),
});

// TODO(launch): the real launch flow plugs in here, behind this OnLaunch signature:
//   1. upload the image and metadata (name, symbol, description, links) → metadata URI
//   2. build the pump.fun create transaction for a fresh mint
//   3. ask the connected wallet to sign it, then call progress.approved()
//   4. send and confirm the transaction
//   5. resolve with { mint }; the coin feed then brings its truck in
// Until then, launching fails clearly instead of pretending.
const onLaunch: OnLaunch = async () => {
  throw new Error("Launching isn't live yet. Nothing was sent and no SOL was spent.");
};

export function HubView() {
  // TODO(coins): connect the live CoinSource here, e.g.
  //   useEffect(() => useGameStore.getState().connect(new ApiCoinSource()), []);
  // Until a coin feed exists the hub runs empty: no coins are invented.
  useEffect(() => {
    // Development only (dropped from production builds): lets scripted checks
    // plug a CoinSource into the store (e.g. the 200-truck stress test).
    if (process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __coinport?: Record<string, unknown> };
      w.__coinport = { ...w.__coinport, store: useGameStore };
    }
  }, []);

  return (
    <div className="relative h-full w-full select-none overscroll-none">
      <HubCanvas />
      <Hud onLaunch={onLaunch} />
    </div>
  );
}
