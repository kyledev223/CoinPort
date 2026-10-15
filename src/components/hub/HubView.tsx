"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { APP_NETWORK } from "@/config";
import { MockCoinSource } from "@/game";
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function HubView() {
  // Swap MockCoinSource for a live CoinSource here; nothing else changes.
  // Created in an effect, not during render: it reads the clock, which must not happen while prerendering.
  const sourceRef = useRef<MockCoinSource | null>(null);
  useEffect(() => {
    const source = new MockCoinSource({ network: APP_NETWORK });
    sourceRef.current = source;
    return useGameStore.getState().connect(source);
  }, []);

  // TODO(launch): stub. The real launch flow plugs in here, behind the same
  // OnLaunch signature:
  //   1. upload the image and metadata (name, symbol, description, links) → metadata URI
  //   2. build the pump.fun create transaction for a fresh mint
  //   3. ask the connected wallet to sign it, then call progress.approved()
  //   4. send and confirm the transaction
  //   5. resolve with { mint }; the live CoinSource then brings the truck in
  // For now it waits a moment and adds the coin to the mock feed, so the
  // dialog's steps and the arrival can be seen end to end.
  const onLaunch: OnLaunch = async (data, progress) => {
    const source = sourceRef.current;
    if (!source) throw new Error("The hub is still loading. Try again in a moment.");
    await delay(1400);
    progress.approved();
    await delay(1600);
    const coin = source.launchCoin({ name: data.name, symbol: data.symbol, imageUrl: URL.createObjectURL(data.image) });
    return { mint: coin.mint };
  };

  return (
    <div className="relative h-full w-full select-none overscroll-none">
      <HubCanvas />
      <Hud onLaunch={onLaunch} />
    </div>
  );
}
