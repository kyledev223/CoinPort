"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { shortAddress, summarizeHub } from "@/game";
import { useWalletUi } from "@/wallet/walletUi";
import { useGameStore } from "@/store/gameStore";
import { formatSol, formatUsd } from "../hub/format";
import { CapIcon, ChartIcon, LogoMark, RocketIcon, TruckIcon, WalletIcon } from "./icons";
import { ProjectLinks } from "./ProjectLinks";

export function TopBar({ onLaunchClick }: { onLaunchClick: () => void }) {
  return (
    <header className="pointer-events-auto relative z-10 border-b border-amber-500/15 bg-panel/95 shadow-lg shadow-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2 sm:gap-x-4 sm:px-3 lg:px-4">
        <Logo />
        <Kpis />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ProjectLinks className="hidden lg:flex" />
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
      {/* Narrow screens: the project links get their own row. */}
      <ProjectLinks className="flex justify-center border-t border-edge px-2.5 py-1.5 lg:hidden" />
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

function WalletButton() {
  const { publicKey, connecting, disconnect } = useWallet();
  const openPicker = useWalletUi((s) => s.openPicker);
  const [menu, setMenu] = useState(false);
  const address = publicKey?.toBase58();

  if (!address) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="flex h-10 items-center gap-2 rounded-lg border border-amber-400/60 px-2 font-display text-sm font-bold tracking-wider text-amber-200 transition hover:bg-amber-400/10 sm:px-2.5"
      >
        <WalletIcon className="text-lg" />
        <span className="hidden md:inline 2xl:hidden min-[1800px]:inline">{connecting ? "CONNECTING…" : "CONNECT WALLET"}</span>
      </button>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        title={address}
        className="flex h-10 items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-2 font-mono text-xs font-semibold text-emerald-200 sm:px-2.5"
      >
        <WalletIcon className="text-lg" />
        <span className="hidden md:inline">{shortAddress(address)}</span>
      </button>
      {menu && (
        <div className="absolute top-12 right-0 z-20 w-44 rounded-lg border border-edge bg-panel p-1 shadow-xl shadow-black/50">
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              void disconnect();
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
