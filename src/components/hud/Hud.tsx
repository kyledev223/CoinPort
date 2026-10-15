"use client";

import { useEffect, useState } from "react";
import { isFiltering } from "@/game";
import { useGameStore } from "@/store/gameStore";
import { useConnectedWallet } from "@/wallet/useConnectedWallet";
import { InspectPanel } from "../hub/InspectPanel";
import { LaunchCoinDialog, type OnLaunch } from "../launch/LaunchCoinDialog";
import { ActivityFeed } from "./ActivityFeed";
import { HudPanel, MobileDrawer, useMediaQuery } from "./chrome";
import { DistrictSelector } from "./DistrictSelector";
import { FiltersPanel } from "./FiltersPanel";
import { FilterIcon, ListIcon, MapIcon } from "./icons";
import { Minimap } from "./Minimap";
import { TopBar } from "./TopBar";

type Drawer = "filters" | "activity" | "map";

/**
 * Everything drawn over the 3D scene. Wide screens get fixed side columns;
 * narrow screens get a bottom toolbar whose panels open as drawers.
 */
export function Hud({ onLaunch }: { onLaunch: OnLaunch }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const [launchOpen, setLaunchOpen] = useState(false);

  // The HUD is the only place that reads the wallet; everything else gets it from the store.
  const wallet = useConnectedWallet();
  useEffect(() => useGameStore.getState().setViewerWallet(wallet), [wallet]);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <TopBar onLaunchClick={() => setLaunchOpen(true)} />
      <div className="relative min-h-0 flex-1">{wide ? <WideLayout /> : <NarrowLayout />}</div>
      <LaunchCoinDialog open={launchOpen} onClose={() => setLaunchOpen(false)} onLaunch={onLaunch} />
    </div>
  );
}

function WideLayout() {
  const selected = useGameStore((s) => s.selection !== null);
  return (
    <>
      <div className="absolute top-3 left-3 flex w-[300px] flex-col gap-3">
        <DistrictSelector />
        <HudPanel title="Filters">
          <FiltersPanel />
        </HudPanel>
      </div>
      <HudPanel title="Minimap" className="absolute bottom-3 left-3 w-[340px]">
        <Minimap />
      </HudPanel>
      <div className="absolute top-3 right-3 bottom-3 flex w-[360px] flex-col gap-3">
        {selected && <InspectPanel className="min-h-0 flex-1" />}
        <HudPanel title="Activity Feed" className={selected ? "h-[38%] min-h-[200px] shrink-0" : "mt-auto max-h-[46%] min-h-[220px]"}>
          <ActivityFeed />
        </HudPanel>
      </div>
    </>
  );
}

function NarrowLayout() {
  const selected = useGameStore((s) => s.selection !== null);
  const filtering = useGameStore((s) => isFiltering(s.filters));
  const [drawer, setDrawer] = useState<Drawer | null>(null);

  // The inspect sheet and the drawers share the bottom of the screen: a new selection closes the drawer.
  useEffect(
    () =>
      useGameStore.subscribe((s, prev) => {
        if (s.selection && s.selection !== prev.selection) setDrawer(null);
      }),
    [],
  );

  const open = (d: Drawer) => {
    useGameStore.getState().select(null);
    setDrawer((cur) => (cur === d ? null : d));
  };

  return (
    <>
      <DistrictSelector className="absolute inset-x-2 top-2" />

      {selected && <InspectPanel className="absolute inset-x-2 bottom-[68px] max-h-[58vh]" />}

      {!selected && drawer === "filters" && (
        <MobileDrawer title="Filters" onClose={() => setDrawer(null)}>
          <FiltersPanel />
        </MobileDrawer>
      )}
      {!selected && drawer === "activity" && (
        <MobileDrawer title="Activity Feed" onClose={() => setDrawer(null)}>
          <div className="h-[48vh]">
            <ActivityFeed />
          </div>
        </MobileDrawer>
      )}
      {!selected && drawer === "map" && (
        <MobileDrawer title="Minimap" onClose={() => setDrawer(null)}>
          <Minimap showLegend={false} />
        </MobileDrawer>
      )}

      {!drawer && (
        <nav
          aria-label="Panels"
          className="pointer-events-auto absolute inset-x-2 bottom-2 grid grid-cols-3 gap-1 rounded-xl border border-amber-500/20 bg-panel/95 p-1 shadow-xl shadow-black/50 backdrop-blur"
        >
          <ToolbarButton label="Filters" onClick={() => open("filters")} dot={filtering}>
            <FilterIcon />
          </ToolbarButton>
          <ToolbarButton label="Activity" onClick={() => open("activity")}>
            <ListIcon />
          </ToolbarButton>
          <ToolbarButton label="Map" onClick={() => open("map")}>
            <MapIcon />
          </ToolbarButton>
        </nav>
      )}
    </>
  );
}

function ToolbarButton({ label, onClick, dot, children }: { label: string; onClick: () => void; dot?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg font-display text-[11px] font-bold tracking-wider text-zinc-300 uppercase hover:bg-white/5 hover:text-amber-300"
    >
      <span className="text-lg">{children}</span>
      {label}
      {dot && <span className="absolute top-2 right-[calc(50%-18px)] h-2 w-2 rounded-full bg-amber-400" aria-label="Filters active" />}
    </button>
  );
}
