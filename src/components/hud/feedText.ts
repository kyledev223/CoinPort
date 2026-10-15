import { DOCKS, type ActivityEvent, type ZoneId } from "@/game";

export type FeedTone = "arrival" | "storage" | "graduation" | "move";

export interface FeedLine {
  /** "$FROG" */
  ticker: string;
  /** Text after the ticker, e.g. " arrived at Bay 3". */
  text: string;
  tone: FeedTone;
}

const STORAGE_NAME: Partial<Record<ZoneId, string>> = {
  "storage-a": "Storage A",
  "storage-b": "Storage B",
  "storage-c": "Storage C",
};

function bay(e: ActivityEvent): string {
  const dock = DOCKS.find((d) => d.id === e.dockId);
  return dock ? `Bay ${dock.number}` : "the Launch Bay";
}

/** Feed wording for one activity event. */
export function describeEvent(e: ActivityEvent): FeedLine {
  const ticker = `$${e.symbol || "???"}`;
  const storage = (e.zoneId && STORAGE_NAME[e.zoneId]) || "storage";
  switch (e.kind) {
    case "arrived":
      return { ticker, text: " rolled in through the Entry Gate", tone: "arrival" };
    case "docked":
      return { ticker, text: ` arrived at ${bay(e)}`, tone: "arrival" };
    case "unloading":
      return { ticker, text: ` unloading crates at ${bay(e)}`, tone: "arrival" };
    case "stored":
      return { ticker, text: ` reached ${storage}`, tone: "storage" };
    case "tier_changed":
      return {
        ticker,
        text: (e.tier ?? 0) > (e.fromTier ?? 0) ? ` moved up to ${storage}` : ` moved down to ${storage}`,
        tone: "move",
      };
    case "hauling":
      return { ticker, text: " filled its curve, hauling to graduation", tone: "graduation" };
    case "graduated":
      return { ticker, text: " graduated!", tone: "graduation" };
    case "departed":
      return { ticker, text: " left through the Graduation Gate", tone: "graduation" };
  }
}

export type FeedFilter = "all" | FeedTone;

export const FEED_FILTERS: ReadonlyArray<{ value: FeedFilter; label: string }> = [
  { value: "all", label: "All events" },
  { value: "arrival", label: "Arrivals" },
  { value: "storage", label: "Storage" },
  { value: "move", label: "Tier moves" },
  { value: "graduation", label: "Graduations" },
];
