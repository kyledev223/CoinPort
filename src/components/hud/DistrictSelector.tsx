"use client";

import { DISTRICTS, type DistrictId } from "@/game";
import { useGameStore } from "@/store/gameStore";
import { CapIcon, RocketIcon, WarehouseIcon } from "./icons";

const ICONS: Record<DistrictId, typeof RocketIcon> = {
  "launch-bay": RocketIcon,
  storage: WarehouseIcon,
  "graduation-gate": CapIcon,
};

/** Segmented control that glides the camera to a district. */
export function DistrictSelector({ className = "" }: { className?: string }) {
  const active = useGameStore((s) => s.district);
  const goToDistrict = useGameStore((s) => s.goToDistrict);
  return (
    <nav
      aria-label="Districts"
      className={`pointer-events-auto grid grid-cols-3 gap-1 rounded-xl border border-amber-500/20 bg-panel/92 p-1 shadow-xl shadow-black/40 backdrop-blur ${className}`}
    >
      {DISTRICTS.map((d) => {
        const Icon = ICONS[d.id];
        const on = active === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => goToDistrict(d.id)}
            aria-pressed={on}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 font-display text-[11px] leading-tight font-bold tracking-wider uppercase transition ${
              on ? "bg-amber-400 text-black" : "text-zinc-300 hover:bg-white/5 hover:text-amber-300"
            }`}
          >
            <Icon className="text-lg" />
            <span className="text-center">{d.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
