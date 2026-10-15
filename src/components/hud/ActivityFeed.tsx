"use client";

import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { FEED_FILTERS, describeEvent, type FeedFilter, type FeedTone } from "./feedText";
import { CapIcon, CrateIcon, TruckIcon, WarehouseIcon } from "./icons";

const MAX_ROWS = 40;

const TONE: Record<FeedTone, { Icon: typeof TruckIcon; color: string; ticker: string }> = {
  arrival: { Icon: TruckIcon, color: "text-zinc-300", ticker: "text-amber-400" },
  storage: { Icon: CrateIcon, color: "text-amber-500", ticker: "text-amber-400" },
  move: { Icon: WarehouseIcon, color: "text-sky-400", ticker: "text-sky-300" },
  graduation: { Icon: CapIcon, color: "text-emerald-400", ticker: "text-emerald-300" },
};

/** Newest-first feed of truck events. Clicking a row focuses that truck if it's still in the hub. */
export function ActivityFeed() {
  const events = useGameStore((s) => s.world.events);
  const truckIndex = useGameStore((s) => s.truckIndex);
  const focusTruck = useGameStore((s) => s.focusTruck);
  const [filter, setFilter] = useState<FeedFilter>("all");

  const rows = [...events]
    .reverse()
    .map((e) => ({ e, line: describeEvent(e) }))
    .filter(({ line }) => filter === "all" || line.tone === filter)
    .slice(0, MAX_ROWS);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex justify-end px-3 pt-2">
        <label className="sr-only" htmlFor="feed-filter">
          Filter events
        </label>
        <select
          id="feed-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as FeedFilter)}
          className="rounded-md border border-edge bg-black/40 px-2 py-1 text-xs text-zinc-200 focus:border-amber-400/60 focus:outline-none"
        >
          {FEED_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">Waiting for trucks to move…</p>
      ) : (
        <ol className="hud-scroll min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
          {rows.map(({ e, line }) => {
            const tone = TONE[line.tone];
            const inHub = Boolean(truckIndex[e.truckId]);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={!inHub}
                  onClick={() => focusTruck(e.truckId)}
                  title={inHub ? `Focus ${line.ticker}` : "This truck has left the hub"}
                  className="grid w-full grid-cols-[44px_20px_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition enabled:hover:bg-white/5 disabled:opacity-55"
                >
                  <time className="font-mono text-[11px] text-zinc-500 tabular-nums" dateTime={new Date(e.at).toISOString()}>
                    {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  <tone.Icon className={`text-base ${tone.color}`} />
                  <span className="min-w-0 truncate text-zinc-200">
                    <span className={`font-semibold ${tone.ticker}`}>{line.ticker}</span>
                    {line.text}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
