import { create } from "zustand";
import {
  DISTRICTS,
  NO_FILTERS,
  createSeedForklifts,
  createWorld,
  sampleMotion,
  stepWorld,
  truckIdForMint,
  type Coin,
  type CoinSource,
  type DistrictId,
  type DockId,
  type ForkliftId,
  type Truck,
  type TruckFilters,
  type TruckId,
  type World,
} from "@/game";

/** How often the world steps. Coin updates show in the panel immediately and move trucks on the next step. */
export const WORLD_TICK_MS = 1000;

/** Camera distance used when focusing a single truck (m). */
const FOCUS_DISTANCE = 55;

/** A one-off request for the camera to glide somewhere; `nonce` makes repeats distinct. */
export interface CameraRequest {
  x: number;
  z: number;
  /** null keeps the current zoom. */
  distance: number | null;
  nonce: number;
}

export type Selection =
  | { kind: "truck"; id: TruckId }
  | { kind: "dock"; id: DockId }
  | { kind: "forklift"; id: ForkliftId };

export interface GameStore {
  status: "idle" | "loading" | "live" | "error";
  /** From the connected source; drives the SIMULATED DATA badge. */
  isSimulated: boolean;
  coins: Record<string, Coin>;
  /** When each coin last changed, epoch ms. */
  coinUpdatedAt: Record<string, number>;
  world: World;
  truckIndex: Record<TruckId, Truck>;
  selection: Selection | null;
  /** Truck the camera is tracking. */
  followTruckId: TruckId | null;
  cameraRequest: CameraRequest | null;
  /** Last district picked in the selector; cleared when the user pans away. */
  district: DistrictId | null;
  filters: TruckFilters;
  /** Mint to focus as soon as its truck exists (e.g. right after a launch). */
  pendingFocusMint: string | null;
  /**
   * The viewer's connected wallet, for "My coins". Set by the HUD from the
   * wallet hook, so the scene never imports wallet code.
   */
  viewerWallet: string | null;

  /** Start feeding the store from `source`. Returns the disconnect function. */
  connect(source: CoinSource): () => void;
  select(selection: Selection | null): void;
  follow(truckId: TruckId | null): void;
  /** Glide the camera to a floor point; stops following. */
  flyTo(x: number, z: number, distance?: number | null): void;
  goToDistrict(id: DistrictId): void;
  /** Select a truck, glide to it and follow it. */
  focusTruck(id: TruckId): void;
  /** Focus the truck for `mint`, now or as soon as it appears. */
  focusMint(mint: string): void;
  /** The user dragged the map: drop follow, district highlight and any pending focus. */
  userPanned(): void;
  setFilters(patch: Partial<TruckFilters>): void;
  setViewerWallet(wallet: string | null): void;
}

function indexTrucks(trucks: readonly Truck[]): Record<TruckId, Truck> {
  return Object.fromEntries(trucks.map((t) => [t.id, t])) as Record<TruckId, Truck>;
}

let nonce = 0;
/** Tears down the current source, so two sources can never feed the store at once. */
let disconnectActive: (() => void) | null = null;

export const useGameStore = create<GameStore>()((set, get) => ({
  status: "idle",
  isSimulated: false,
  coins: {},
  coinUpdatedAt: {},
  world: createWorld(createSeedForklifts(), 0),
  truckIndex: {},
  selection: null,
  followTruckId: null,
  cameraRequest: null,
  district: null,
  filters: NO_FILTERS,
  pendingFocusMint: null,
  viewerWallet: null,

  connect(source) {
    // A new source replaces the old one: never mix (e.g. simulated) coins from two feeds.
    disconnectActive?.();
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    set({
      status: "loading",
      isSimulated: source.isSimulated,
      coins: {},
      coinUpdatedAt: {},
      world: createWorld(createSeedForklifts(), Date.now()),
      truckIndex: {},
      selection: null,
      followTruckId: null,
      pendingFocusMint: null,
    });

    const upsert = (list: readonly Coin[], overwrite: boolean) =>
      set((s) => {
        const coins = { ...s.coins };
        const coinUpdatedAt = { ...s.coinUpdatedAt };
        const at = Date.now();
        for (const c of list) {
          if (!overwrite && coins[c.mint]) continue;
          coins[c.mint] = c;
          coinUpdatedAt[c.mint] = at;
        }
        return { coins, coinUpdatedAt };
      });

    const tick = () => {
      set((s) => {
        const world = stepWorld(s.world, s.coins, Date.now());
        const truckIndex = indexTrucks(world.trucks);
        // Drop selection / follow when their truck has left the hub.
        const selection = s.selection?.kind === "truck" && !truckIndex[s.selection.id] ? null : s.selection;
        const followTruckId = s.followTruckId && truckIndex[s.followTruckId] ? s.followTruckId : null;
        return { world, truckIndex, selection, followTruckId };
      });
      // A focus requested before its truck existed (e.g. a fresh launch) lands now.
      const pending = get().pendingFocusMint;
      if (pending && get().truckIndex[truckIdForMint(pending)]) get().focusMint(pending);
    };

    const unsubscribe = source.subscribe((changed) => upsert(changed, true));
    source
      .listCoins()
      .then((list) => {
        if (cancelled) return;
        // Updates that arrived while the snapshot loaded are newer; keep them.
        upsert(list, false);
        tick(); // first step places the existing trucks
        set({ status: "live" });
        timer = setInterval(tick, WORLD_TICK_MS);
      })
      .catch(() => {
        if (!cancelled) set({ status: "error" });
      });

    const disconnect = () => {
      if (cancelled) return;
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
      if (disconnectActive === disconnect) disconnectActive = null;
    };
    disconnectActive = disconnect;
    return disconnect;
  },

  select(selection) {
    set({ selection });
  },

  follow(followTruckId) {
    set({ followTruckId });
  },

  flyTo(x, z, distance = null) {
    set({ cameraRequest: { x, z, distance, nonce: ++nonce }, followTruckId: null, district: null });
  },

  goToDistrict(id) {
    const d = DISTRICTS.find((x) => x.id === id);
    if (!d) return;
    get().flyTo(d.x, d.z, d.distance);
    set({ district: id });
  },

  focusTruck(id) {
    const motion = get().world.motions[id];
    if (!motion) return;
    const pose = sampleMotion(motion, Date.now());
    set({
      selection: { kind: "truck", id },
      followTruckId: id,
      district: null,
      pendingFocusMint: null,
      cameraRequest: { x: pose.x, z: pose.z, distance: FOCUS_DISTANCE, nonce: ++nonce },
    });
  },

  focusMint(mint) {
    const id = truckIdForMint(mint);
    if (get().truckIndex[id]) get().focusTruck(id);
    else set({ pendingFocusMint: mint });
  },

  userPanned() {
    const s = get();
    if (s.followTruckId || s.district || s.pendingFocusMint) set({ followTruckId: null, district: null, pendingFocusMint: null });
  },

  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }));
  },

  setViewerWallet(viewerWallet) {
    if (get().viewerWallet !== viewerWallet) set({ viewerWallet });
  },
}));

// ---------------------------------------------------------------------------
// Selectors shared by scene and panel.

export const selectCoinForTruck = (id: TruckId) => (s: GameStore) => {
  const truck = s.truckIndex[id];
  return truck ? s.coins[truck.mint] : undefined;
};

export const selectIsSelected = (kind: Selection["kind"], id: string) => (s: GameStore) =>
  s.selection?.kind === kind && s.selection.id === id;
