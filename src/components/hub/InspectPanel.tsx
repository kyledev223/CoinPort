"use client";

import { useState, type ReactNode } from "react";
import {
  CRATES_PER_TRUCK,
  DOCKS,
  ZONES,
  clampProgress,
  lifecycleSteps,
  pumpFunUrl,
  shortAddress,
  solscanAccountUrl,
  solscanTokenUrl,
  tierForZone,
  type DockId,
  type ForkliftId,
  type LifecycleStep,
  type TruckId,
} from "@/game";
import { selectCoinForTruck, useGameStore } from "@/store/gameStore";
import { formatAge, formatAgo, formatClock, formatSol, formatUsd } from "./format";
import { coinColor } from "./palette";

/** Side panel for whatever is selected in the scene. Reads the store, so it updates live. */
export function InspectPanel({ className = "" }: { className?: string }) {
  const selection = useGameStore((s) => s.selection);
  const select = useGameStore((s) => s.select);
  if (!selection) return null;

  const title = selection.kind === "truck" ? "Truck details" : selection.kind === "dock" ? "Dock details" : "Forklift details";
  return (
    <aside
      className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-amber-500/25 bg-panel/95 text-zinc-200 shadow-2xl shadow-black/50 backdrop-blur ${className}`}
      aria-label={title}
    >
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 className="font-display text-sm font-bold tracking-[0.16em] text-amber-400 uppercase">{title}</h2>
        <button
          type="button"
          onClick={() => select(null)}
          className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          aria-label="Close panel"
        >
          ✕
        </button>
      </header>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {selection.kind === "truck" && <TruckPanel id={selection.id} />}
        {selection.kind === "dock" && <DockPanel id={selection.id} />}
        {selection.kind === "forklift" && <ForkliftPanel id={selection.id} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function TruckPanel({ id }: { id: TruckId }) {
  const truck = useGameStore((s) => s.truckIndex[id]);
  const coin = useGameStore(selectCoinForTruck(id));
  const history = useGameStore((s) => s.world.history[id]);
  const now = useGameStore((s) => s.world.now);
  const updatedAt = useGameStore((s) => s.coinUpdatedAt[s.truckIndex[id]?.mint ?? ""]);
  const following = useGameStore((s) => s.followTruckId === id);
  const follow = useGameStore((s) => s.follow);
  const focusTruck = useGameStore((s) => s.focusTruck);
  if (!truck || !coin) return <p className="text-sm text-zinc-400">This truck has left the hub.</p>;

  const tier = tierForZone(truck.zoneId);
  const progress = clampProgress(coin.curveProgress);
  const steps = lifecycleSteps(truck, history ?? {});

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CoinImage url={coin.imageUrl} symbol={coin.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-semibold text-zinc-50">{coin.name}</p>
            {tier && (
              <span className="shrink-0 rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300">
                TIER {tier}
              </span>
            )}
          </div>
          <p className="text-xl font-bold text-amber-400">{coin.symbol}</p>
          {coin.graduated && <p className="text-xs text-emerald-300">Graduated off the bonding curve</p>}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Mint</dt>
        <dd className="flex items-center gap-2 font-mono">
          <span title={coin.mint}>{shortAddress(coin.mint)}</span>
          <CopyButton text={coin.mint} />
        </dd>
        <dt className="text-zinc-500">Creator</dt>
        <dd className="font-mono">
          <a
            href={solscanAccountUrl(coin.creatorWallet, coin.network)}
            target="_blank"
            rel="noopener noreferrer"
            title={coin.creatorWallet}
            className="hover:text-amber-300"
          >
            {shortAddress(coin.creatorWallet)}
          </a>
        </dd>
        <dt className="text-zinc-500">Age</dt>
        <dd>{formatAge(now - coin.createdAt)}</dd>
        <dt className="text-zinc-500">Network</dt>
        <dd>{coin.network === "devnet" ? "Devnet" : "Mainnet"}</dd>
      </dl>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Market cap">{formatSol(coin.marketCapSol)}</Stat>
        <Stat label="USD">{coin.marketCapUsd !== undefined ? formatUsd(coin.marketCapUsd) : "—"}</Stat>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-zinc-400">Bonding curve progress</span>
          <span className="font-semibold text-amber-400">{Math.round(progress * 100)}%</span>
        </div>
        <CurveBar progress={progress} />
      </div>

      <Stepper steps={steps} now={now} state={truck.state} />

      <p className="text-xs text-zinc-500">
        Last update {updatedAt ? `${formatAgo(now - updatedAt)} · ${formatClock(updatedAt)}` : "—"}
      </p>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => (following ? follow(null) : focusTruck(id))}
          aria-pressed={following}
          className={`rounded-lg px-3 py-2 text-sm font-bold tracking-wide transition ${
            following ? "bg-amber-400 text-black" : "border border-amber-400/60 text-amber-300 hover:bg-amber-400/10"
          }`}
        >
          {following ? "Following — drag the map to stop" : "Follow"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <ExternalLink href={pumpFunUrl(coin)}>View on pump.fun</ExternalLink>
          <ExternalLink href={solscanTokenUrl(coin)}>View on Solscan</ExternalLink>
        </div>
      </div>
    </div>
  );
}

function CoinImage({ url, symbol }: { url: string; symbol: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
        style={{ background: coinColor(symbol, 55, 36) }}
      >
        {symbol}
      </div>
    );
  }
  return (
    // Plain <img>: coin images come from arbitrary hosts (IPFS gateways etc.), not a fixed next/image allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`${symbol} logo`}
      width={64}
      height={64}
      onError={() => setFailedUrl(url)}
      className="h-16 w-16 shrink-0 rounded-xl object-cover"
    />
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
      className="rounded border border-white/10 px-1.5 py-0.5 font-sans text-[11px] text-zinc-300 hover:border-amber-400/50 hover:text-amber-300"
      aria-label="Copy mint address"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CurveBar({ progress }: { progress: number }) {
  const segments = 24;
  const filled = Math.round(progress * segments);
  return (
    <div
      className="flex gap-[3px] rounded border border-white/10 bg-black/30 p-[3px]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Bonding curve progress"
    >
      {Array.from({ length: segments }, (_, i) => (
        <div key={i} className={`h-3 flex-1 rounded-[2px] ${i < filled ? "bg-amber-400" : "bg-white/8"}`} />
      ))}
    </div>
  );
}

function Stepper({ steps, now, state }: { steps: LifecycleStep[]; now: number; state: string }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex items-center gap-3 py-2">
          {i < steps.length - 1 && <span className="absolute top-7 left-[11px] h-[calc(100%-12px)] w-px bg-white/10" />}
          <StepIcon status={step.status} />
          <span
            className={`flex-1 text-sm ${
              step.status === "current" ? "font-semibold text-amber-400" : step.status === "done" ? "text-zinc-100" : "text-zinc-500"
            }`}
          >
            {step.label}
          </span>
          <span className="text-xs text-zinc-500">{stepNote(step, now, state)}</span>
        </li>
      ))}
    </ol>
  );
}

function stepNote(step: LifecycleStep, now: number, state: string): string {
  if (step.status === "pending") return "Pending";
  if (step.status === "current") {
    if (state === "docking") return "Docking…";
    if (state === "departed") return "Leaving the hub…";
    if (state === "stored") return step.at ? `since ${formatAgo(now - step.at)}` : "Stored";
    return "In progress…";
  }
  return step.at ? formatAgo(now - step.at) : "Done";
}

function StepIcon({ status }: { status: LifecycleStep["status"] }) {
  if (status === "done") {
    return (
      <span className="z-10 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-black">✓</span>
    );
  }
  if (status === "current") {
    return (
      <span className="z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-400 bg-[#0b0f15]">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
      </span>
    );
  }
  return <span className="z-10 h-6 w-6 rounded-full border-2 border-zinc-600 bg-[#0b0f15]" />;
}

// ---------------------------------------------------------------------------

function DockPanel({ id }: { id: DockId }) {
  const dock = DOCKS.find((d) => d.id === id);
  const bay = useGameStore((s) => s.world.bays[id]);
  const truck = useGameStore((s) => (bay?.truckId ? s.truckIndex[bay.truckId] : undefined));
  const coin = useGameStore((s) => (truck ? s.coins[truck.mint] : undefined));
  const select = useGameStore((s) => s.select);
  if (!dock || !bay) return null;

  const status = !truck ? "Free" : truck.state === "docking" ? "Truck docking" : "Unloading";
  return (
    <div className="space-y-4">
      <p className="text-2xl font-bold text-zinc-50">Dock {String(dock.number).padStart(2, "0")}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Status</dt>
        <dd className={truck ? "text-amber-300" : "text-emerald-300"}>{status}</dd>
        <dt className="text-zinc-500">Truck</dt>
        <dd>{coin ? coin.symbol : "—"}</dd>
        <dt className="text-zinc-500">Crates unloaded</dt>
        <dd>
          {bay.crates} / {truck ? CRATES_PER_TRUCK : 0}
        </dd>
      </dl>
      {truck && (
        <button
          type="button"
          onClick={() => select({ kind: "truck", id: truck.id })}
          className="w-full rounded-lg border border-amber-400/60 px-3 py-2 text-sm font-bold text-amber-300 hover:bg-amber-400/10"
        >
          Inspect {coin?.symbol ?? "truck"}
        </button>
      )}
    </div>
  );
}

function ForkliftPanel({ id }: { id: ForkliftId }) {
  const forklift = useGameStore((s) => s.world.forklifts.find((f) => f.id === id));
  const home = useGameStore((s) => s.world.forkliftHomes[id]);
  const truck = useGameStore((s) => (forklift?.truckId ? s.truckIndex[forklift.truckId] : undefined));
  const coin = useGameStore((s) => (truck ? s.coins[truck.mint] : undefined));
  const select = useGameStore((s) => s.select);
  if (!forklift) return null;

  const task = { idle: "Idle", unloading: "Unloading", stacking: "Stacking", loading: "Loading" }[forklift.task];
  const dock = truck?.dockId ? DOCKS.find((d) => d.id === truck.dockId) : undefined;
  return (
    <div className="space-y-4">
      <p className="text-2xl font-bold text-zinc-50">Forklift {forklift.id.replace("forklift-", "")}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Task</dt>
        <dd className={forklift.task === "idle" ? "text-zinc-300" : "text-amber-300"}>{task}</dd>
        <dt className="text-zinc-500">Home</dt>
        <dd>{home ? ZONES[home.zoneId].label : "—"}</dd>
        <dt className="text-zinc-500">Serving</dt>
        <dd>{coin ? `${coin.symbol}${dock ? ` at dock ${String(dock.number).padStart(2, "0")}` : ""}` : "—"}</dd>
      </dl>
      {truck && (
        <button
          type="button"
          onClick={() => select({ kind: "truck", id: truck.id })}
          className="w-full rounded-lg border border-amber-400/60 px-3 py-2 text-sm font-bold text-amber-300 hover:bg-amber-400/10"
        >
          Inspect {coin?.symbol ?? "truck"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-50">{children}</p>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-white/10 px-3 py-2 text-center text-xs font-semibold text-zinc-200 hover:border-amber-400/50 hover:text-amber-300"
    >
      {children} ↗
    </a>
  );
}
