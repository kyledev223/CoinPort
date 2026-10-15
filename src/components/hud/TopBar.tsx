"use client";

import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { APP_NETWORK } from "@/config";
import { summarizeHub } from "@/game";
import { useGameStore } from "@/store/gameStore";
import { formatSol, formatUsd } from "../hub/format";
import { CapIcon, ChartIcon, LogoMark, RocketIcon, TruckIcon, WalletIcon } from "./icons";

export function TopBar({ onLaunchClick }: { onLaunchClick: () => void }) {
  const simulated = useGameStore((s) => s.isSimulated);
  const feedDown = useGameStore((s) => s.status === "error");
  return (
    <header className="pointer-events-auto relative z-10 border-b border-amber-500/15 bg-panel/95 shadow-lg shadow-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2 sm:gap-x-4 sm:px-3 lg:px-4">
        <Logo />
        <Kpis />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {feedDown && (
            <div role="alert" className="flex h-10 items-center rounded-lg border border-red-500/50 bg-red-500/10 px-2.5 font-display text-xs font-bold tracking-wider text-red-300">
              FEED OFFLINE
            </div>
          )}
          {simulated && <SimulatedBadge className="hidden sm:flex" />}
          <NetworkBadge />
          <WalletButton />
          <button
            type="button"
            onClick={onLaunchClick}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-amber-400 px-2 font-display text-xs sm:px-2.5 sm:text-sm font-bold tracking-wider text-black shadow-[0_0_18px_rgba(255,177,59,0.35)] transition hover:bg-amber-300 sm:px-4"
          >
            <RocketIcon className="text-lg" />
            <span>
              LAUNCH<span className="hidden sm:inline"> COIN</span>
            </span>
          </button>
        </div>
      </div>
      {simulated && <SimulatedBadge className="flex sm:hidden" banner />}
    </header>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 pr-1 sm:gap-2.5 sm:pr-2">
      <LogoMark className="text-[26px] sm:text-[34px]" />
      <div className="leading-none">
        <p className="font-display text-base font-bold tracking-[0.06em] whitespace-nowrap text-zinc-100 sm:text-xl sm:tracking-[0.12em]">
          COIN <span className="text-amber-400">PORT</span>
        </p>
        <p className="mt-1 hidden font-display text-[10px] font-semibold tracking-[0.2em] text-zinc-400 sm:block">
          LAUNCH · STORE · SCALE · GRADUATE
        </p>
      </div>
    </div>
  );
}

function Kpis() {
  const stats = useGameStore(useShallow((s) => summarizeHub(Object.values(s.coins), s.world.trucks, s.world.now)));
  const usdComplete = stats.coinsMissingUsd === 0;
  return (
    <div className="hud-scroll order-last -mx-3 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-0.5 lg:mx-0 lg:w-full lg:px-0 2xl:order-none 2xl:w-auto 2xl:min-w-0 2xl:flex-1 2xl:overflow-visible">
      <Kpi icon={<RocketIcon />} label="Coins Launched 24h" value={stats.coinsLaunchedInWindow.toLocaleString("en-US")} />
      <Kpi icon={<TruckIcon />} label="Trucks on Floor" value={stats.trucksOnFloor.toLocaleString("en-US")} />
      <Kpi icon={<CapIcon />} label="Graduations" value={stats.graduations.toLocaleString("en-US")} />
      <Kpi
        icon={<ChartIcon />}
        label="Total Market Cap"
        value={usdComplete ? formatUsd(stats.totalMarketCapUsd) : formatSol(stats.totalMarketCapSol)}
        title={
          usdComplete
            ? `${formatSol(stats.totalMarketCapSol)} across all coins`
            : `Shown in SOL: ${stats.coinsMissingUsd} coin(s) have no USD price yet`
        }
      />
    </div>
  );
}

function Kpi({ icon, label, value, title }: { icon: ReactNode; label: string; value: string; title?: string }) {
  return (
    <div
      title={title}
      className="flex min-w-[150px] flex-1 items-center gap-3 rounded-lg border border-edge bg-panel-raised/80 px-3 py-1.5 2xl:min-w-0"
    >
      <span className="text-2xl text-amber-400">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-zinc-400">{label}</p>
        <p className="font-display text-xl leading-tight font-bold whitespace-nowrap text-zinc-50 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/** Always-visible network badge, read from the single APP_NETWORK config value. */
function NetworkBadge() {
  const devnet = APP_NETWORK === "devnet";
  return (
    <div
      className="flex h-10 items-center gap-1.5 rounded-lg border border-edge bg-panel-raised/80 px-2 font-display text-xs font-bold tracking-wider sm:gap-2 sm:px-2.5 sm:text-sm"
      title={`Solana ${devnet ? "devnet" : "mainnet"}`}
    >
      <span className={`h-2 w-2 rounded-full ${devnet ? "bg-emerald-400" : "bg-sky-400"} shadow-[0_0_8px_currentColor]`} />
      <span className="text-zinc-100">{devnet ? "DEVNET" : "MAINNET"}</span>
      <svg viewBox="0 0 16 12" className="hidden h-3 w-4 text-emerald-400 sm:block" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 4} y={9 - i * 3} width="2.5" height={3 + i * 3} fill="currentColor" rx="0.5" />
        ))}
      </svg>
    </div>
  );
}

function WalletButton() {
  // TODO(wallet): placeholder. Open the wallet adapter's connect modal here and
  // show the connected address; useConnectedWallet() should then return it.
  return (
    <button
      type="button"
      aria-disabled="true"
      title="Wallet connection isn't available yet"
      onClick={(e) => e.preventDefault()}
      className="flex h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-amber-400/40 px-2 sm:px-2.5 font-display text-sm font-bold tracking-wider text-amber-200/80"
    >
      <WalletIcon className="text-lg" />
      <span className="hidden md:inline 2xl:hidden min-[1800px]:inline">CONNECT WALLET</span>
    </button>
  );
}

/** Striped warning so mock numbers are never mistaken for real ones. */
function SimulatedBadge({ className = "", banner = false }: { className?: string; banner?: boolean }) {
  return (
    <div
      role="status"
      title="Coins, prices and launches are generated by MockCoinSource. Not real market data."
      className={`items-center justify-center gap-2 border-amber-400 bg-[repeating-linear-gradient(-45deg,rgba(251,191,36,0.24)_0_10px,rgba(0,0,0,0.55)_10px_20px)] font-display font-bold tracking-[0.2em] text-amber-300 ${
        banner ? "border-t py-1 text-[11px]" : "h-10 rounded-lg border-2 px-3 text-xs"
      } ${className}`}
    >
      ⚠ SIMULATED DATA
    </div>
  );
}
