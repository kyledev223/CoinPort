"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/** True while `query` matches; false during server render. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Dark steel card with an amber heading, the HUD's standard panel. */
export function HudPanel({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-amber-500/20 bg-panel/92 shadow-xl shadow-black/40 backdrop-blur ${className}`}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-2 border-b border-edge px-3.5 py-2.5">
        <h2 className="font-display text-sm font-bold tracking-[0.16em] text-amber-400 uppercase">{title}</h2>
        {actions}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Bottom sheet used on narrow screens in place of the side panels. */
export function MobileDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[68vh] flex-col rounded-t-2xl border-t border-amber-500/30 bg-panel/97 shadow-2xl shadow-black backdrop-blur"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15" />
      <header className="flex items-center justify-between px-4 py-2">
        <h2 className="font-display text-sm font-bold tracking-[0.16em] text-amber-400 uppercase">{title}</h2>
        <button type="button" onClick={onClose} className="rounded p-1.5 text-zinc-400 hover:bg-white/5" aria-label={`Close ${title}`}>
          <CloseIcon className="text-lg" />
        </button>
      </header>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-1 pb-[max(12px,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
