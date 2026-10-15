"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { DOCKS, OVERFLOW_LOT, ROAD_SEGMENTS, ZONES, ZONE_IDS, matchesTruckFilters, sampleMotion, type ZoneKind } from "@/game";
import { cameraView } from "@/store/cameraView";
import { useGameStore } from "@/store/gameStore";

/** World area the minimap shows (plan view, north up). */
const WORLD = { minX: -80, maxX: 132, minZ: -64, maxZ: 72 };
const ASPECT = (WORLD.maxX - WORLD.minX) / (WORLD.maxZ - WORLD.minZ);

const ZONE_COLOR: Record<ZoneKind, string> = {
  entry: "#f5c542",
  "launch-bay": "#ff8c1a",
  yard: "#6b7280",
  storage: "#4f7fe8",
  graduation: "#34c76f",
};

const LEGEND: Array<{ label: string; color: string }> = [
  { label: "Entry", color: ZONE_COLOR.entry },
  { label: "Launch Bay", color: ZONE_COLOR["launch-bay"] },
  { label: "Warehouses", color: ZONE_COLOR.storage },
  { label: "Graduation", color: ZONE_COLOR.graduation },
  { label: "Overflow Lot", color: ZONE_COLOR.yard },
  { label: "Trucks", color: "#ffffff" },
];

/** Live plan view: zones, roads, truck dots and the camera's view. Click to glide there. */
export function Minimap({ showLegend = true }: { showLegend?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sx = w / (WORLD.maxX - WORLD.minX);
      const sz = h / (WORLD.maxZ - WORLD.minZ);
      const px = (x: number) => (x - WORLD.minX) * sx;
      const pz = (z: number) => (z - WORLD.minZ) * sz;

      ctx.fillStyle = "#070a10";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (const [a, b] of ROAD_SEGMENTS) {
        ctx.beginPath();
        ctx.moveTo(px(a.x), pz(a.z));
        ctx.lineTo(px(b.x), pz(b.z));
        ctx.stroke();
      }

      for (const id of ZONE_IDS) {
        const { center, size, kind } = ZONES[id];
        const color = ZONE_COLOR[kind];
        const x = px(center.x - size.width / 2);
        const y = pz(center.z - size.depth / 2);
        ctx.fillStyle = `${color}26`;
        ctx.fillRect(x, y, size.width * sx, size.depth * sz);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size.width * sx - 1, size.depth * sz - 1);
      }
      {
        const lot = OVERFLOW_LOT;
        ctx.fillStyle = `${ZONE_COLOR.yard}26`;
        ctx.fillRect(px(lot.minX), pz(lot.minZ), (lot.maxX - lot.minX) * sx, (lot.maxZ - lot.minZ) * sz);
        ctx.strokeStyle = ZONE_COLOR.yard;
        ctx.strokeRect(px(lot.minX) + 0.5, pz(lot.minZ) + 0.5, (lot.maxX - lot.minX) * sx - 1, (lot.maxZ - lot.minZ) * sz - 1);
      }
      ctx.fillStyle = ZONE_COLOR["launch-bay"];
      for (const d of DOCKS) ctx.fillRect(px(d.position.x) - 1.5, pz(d.position.z - 4) - 1, 3, 2);

      const s = useGameStore.getState();
      const now = Date.now();
      const selectedId = s.selection?.kind === "truck" ? s.selection.id : null;
      for (const t of s.world.trucks) {
        const m = s.world.motions[t.id];
        if (!m) continue;
        const pose = sampleMotion(m, now);
        const visible = matchesTruckFilters(t, s.coins[t.mint], s.filters, s.viewerWallet);
        ctx.globalAlpha = visible ? 1 : 0.22;
        ctx.fillStyle = t.id === selectedId ? "#ffb13b" : "#ffffff";
        ctx.beginPath();
        ctx.arc(px(pose.x), pz(pose.z), t.id === selectedId ? 3.6 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const fp = cameraView.footprint;
      if (fp.length === 4) {
        ctx.strokeStyle = "rgba(255,177,59,0.9)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        fp.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
        ctx.closePath();
        ctx.stroke();
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = WORLD.minX + ((e.clientX - r.left) / r.width) * (WORLD.maxX - WORLD.minX);
    const z = WORLD.minZ + ((e.clientY - r.top) / r.height) * (WORLD.maxZ - WORLD.minZ);
    useGameStore.getState().flyTo(x, z);
  };

  return (
    <div className="flex gap-3 p-3">
      <div className="relative min-w-0 flex-1">
        <canvas
          ref={canvas}
          onClick={onClick}
          className="block w-full cursor-crosshair rounded-md border border-edge"
          style={{ aspectRatio: String(ASPECT) }}
          role="img"
          aria-label="Minimap of the hub. Click to move the camera there."
        />
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/30 bg-black/50 font-display text-[10px] font-bold text-zinc-200">
          N
        </span>
      </div>
      {showLegend && (
        <ul className="flex shrink-0 flex-col justify-center gap-1.5 text-[11px] text-zinc-300">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
