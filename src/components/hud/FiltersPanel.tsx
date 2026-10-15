"use client";

import { LIFECYCLE_STAGES, NO_FILTERS, isFiltering, matchesTruckFilters, type LifecycleStage } from "@/game";
import { useGameStore } from "@/store/gameStore";
import { SearchIcon } from "./icons";

/** Truck filters: lifecycle stage, My coins and search. Trucks that don't match fade in the scene. */
export function FiltersPanel() {
  const filters = useGameStore((s) => s.filters);
  const setFilters = useGameStore((s) => s.setFilters);
  const wallet = useGameStore((s) => s.viewerWallet);
  const total = useGameStore((s) => s.world.trucks.length);
  const shown = useGameStore((s) =>
    s.world.trucks.reduce((n, t) => n + (matchesTruckFilters(t, s.coins[t.mint], s.filters, s.viewerWallet) ? 1 : 0), 0),
  );
  const active = isFiltering(filters);

  const toggleStage = (stage: LifecycleStage) =>
    setFilters({
      stages: filters.stages.includes(stage) ? filters.stages.filter((s) => s !== stage) : [...filters.stages, stage],
    });

  return (
    <div className="space-y-3 p-3.5">
      <label className="relative block">
        <span className="sr-only">Search coins</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Search name or $TICKER"
          className="h-10 w-full rounded-lg border border-edge bg-black/30 pr-3 pl-9 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/60 focus:outline-none"
        />
      </label>

      <fieldset>
        <legend className="mb-1.5 text-xs text-zinc-400">Truck state</legend>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={filters.stages.length === 0} onClick={() => setFilters({ stages: [] })}>
            All
          </Chip>
          {LIFECYCLE_STAGES.map(({ stage, label }) => (
            <Chip key={stage} on={filters.stages.includes(stage)} onClick={() => toggleStage(stage)}>
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-sm ${wallet ? "text-zinc-100" : "text-zinc-500"}`}>My coins</p>
          {!wallet && <p className="text-[11px] text-zinc-500">Connect a wallet to see coins you created.</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={filters.mineOnly}
          aria-label="Show only my coins"
          disabled={!wallet}
          onClick={() => setFilters({ mineOnly: !filters.mineOnly })}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${
            filters.mineOnly ? "border-amber-400 bg-amber-400/80" : "border-edge bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all ${filters.mineOnly ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-edge pt-2.5 text-xs">
        <span className="text-zinc-400">
          Showing <span className="font-semibold text-zinc-100">{shown}</span> of {total} trucks
        </span>
        {active && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-semibold text-amber-400 hover:text-amber-300">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
        on ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-edge text-zinc-300 hover:border-amber-400/40"
      }`}
    >
      {children}
    </button>
  );
}
