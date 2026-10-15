/**
 * Deterministic seed data for MockCoinSource: 20 coins spread across the
 * lifecycle, plus the hub's forklifts. Logos live in /public/mock-coins.
 */

import { ZONES, slotPosition } from "../layout";
import type { Coin, Forklift, Network } from "../types";

/** SOL/USD used to fill `marketCapUsd` on mock coins. */
export const MOCK_SOL_USD = 160;

// pump.fun-style constant-product curve: 30 virtual SOL against 1.073B
// virtual tokens, 1B supply, 793.1M tokens sold on the curve.
const VIRTUAL_SOL = 30;
const VIRTUAL_TOKENS = 1_073_000_000;
const CURVE_TOKENS = 793_100_000;
const TOTAL_SUPPLY = 1_000_000_000;

/** Market cap in SOL at a given curve progress (≈28 SOL at 0, ≈411 SOL at 1). */
export function marketCapSolAtProgress(progress: number): number {
  const tokensLeft = VIRTUAL_TOKENS - CURVE_TOKENS * Math.min(1, Math.max(0, progress));
  return (TOTAL_SUPPLY * VIRTUAL_SOL * VIRTUAL_TOKENS) / (tokensLeft * tokensLeft);
}

/** Small seeded PRNG so mock mints and simulation are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function fakeBase58(rand: () => number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += BASE58[Math.floor(rand() * BASE58.length)];
  return s;
}

/** pump.fun vanity mints end in "pump". */
export function fakePumpMint(rand: () => number): string {
  return fakeBase58(rand, 40) + "pump";
}

interface SeedCoin {
  symbol: string;
  name: string;
  /** How long before "now" the coin launched. */
  ageMs: number;
  curveProgress: number;
  graduated?: boolean;
  /** Override for graduated coins, whose market cap has left the curve. */
  marketCapSol?: number;
  /** Leave marketCapUsd unset, as when the price feed lags. */
  noUsd?: boolean;
}

const S = 1000;
const M = 60 * S;
const H = 60 * M;

// Expected state on first load (with default constants) in comments.
const SEED_COINS: SeedCoin[] = [
  { symbol: "FROG", name: "FrogFuel", ageMs: 3 * S, curveProgress: 0.02 }, // arriving, entry gate
  { symbol: "ZAP", name: "ZapZebra", ageMs: 9 * S, curveProgress: 0.04 }, // docks immediately
  { symbol: "TACO", name: "TacoTanker", ageMs: 20 * S, curveProgress: 0.07 }, // docks immediately
  { symbol: "CRAB", name: "CrabCrane", ageMs: 33 * S, curveProgress: 0.11 }, // docks immediately
  { symbol: "MOON", name: "MoonMule", ageMs: 2 * M, curveProgress: 0.12, noUsd: true }, // Tier 1
  { symbol: "PNGN", name: "PenguinPallet", ageMs: 5 * M, curveProgress: 0.08, noUsd: true }, // Tier 1
  { symbol: "CATX", name: "MeowX", ageMs: 6 * M, curveProgress: 0.55 }, // Tier 2
  { symbol: "SHRMP", name: "ShrimpShip", ageMs: 9 * M, curveProgress: 0.4 }, // Tier 2
  { symbol: "GRUB", name: "Grubworm", ageMs: 14 * M, curveProgress: 0.31 }, // Tier 1, just under 50 SOL
  { symbol: "RKT", name: "RocketKit", ageMs: 25 * M, curveProgress: 0.88 }, // Tier 3
  { symbol: "DUCK", name: "DuckDiesel", ageMs: 35 * M, curveProgress: 0.21 }, // Tier 1
  { symbol: "YETI", name: "YetiYield", ageMs: 48 * M, curveProgress: 0.72 }, // Tier 2
  { symbol: "GOOS", name: "Gooseneck", ageMs: 70 * M, curveProgress: 1 }, // hauling
  { symbol: "BLOB", name: "BlobBarge", ageMs: 90 * M, curveProgress: 0.05 }, // Tier 1
  { symbol: "BEAR", name: "BearBox", ageMs: 2 * H, curveProgress: 0.8 }, // Tier 3
  { symbol: "OWL", name: "NightOwl", ageMs: 3 * H, curveProgress: 0.93 }, // Tier 3
  { symbol: "HAMR", name: "HamsterHauler", ageMs: 4 * H, curveProgress: 0.64 }, // Tier 2
  { symbol: "SLTH", name: "SlothSemi", ageMs: 6 * H, curveProgress: 0.97 }, // Tier 3, near completion
  { symbol: "DOGP", name: "DoggoPeak", ageMs: 7 * H, curveProgress: 1, graduated: true, marketCapSol: 2_450 },
  { symbol: "KOI", name: "KoiCargo", ageMs: 12 * H, curveProgress: 1, graduated: true, marketCapSol: 610 },
];

/** Names for coins the simulation launches after load; each has a logo. */
export const LAUNCH_POOL: ReadonlyArray<{ symbol: string; name: string }> = [
  { symbol: "LLMA", name: "LlamaLorry" },
  { symbol: "OTTR", name: "OtterOil" },
  { symbol: "BISN", name: "BisonBulk" },
  { symbol: "GEKO", name: "GeckoGear" },
  { symbol: "PNDA", name: "PandaParcel" },
  { symbol: "WASP", name: "WaspWagon" },
];

export function mockLogoUrl(symbol: string): string {
  return `/mock-coins/${symbol.toLowerCase()}.svg`;
}

export function makeMockCoin(
  rand: () => number,
  fields: {
    symbol: string;
    name: string;
    createdAt: number;
    curveProgress: number;
    graduated?: boolean;
    marketCapSol?: number;
    noUsd?: boolean;
    network?: Network;
    /** Overrides the bundled /mock-coins logo. */
    imageUrl?: string;
  },
): Coin {
  const mint = fakePumpMint(rand);
  const marketCapSol = fields.marketCapSol ?? marketCapSolAtProgress(fields.curveProgress);
  return {
    mint,
    name: fields.name,
    symbol: fields.symbol,
    imageUrl: fields.imageUrl ?? mockLogoUrl(fields.symbol),
    metadataUri: `mock://metadata/${mint}`,
    creatorWallet: fakeBase58(rand, 44),
    createdAt: fields.createdAt,
    network: fields.network ?? "devnet",
    marketCapSol,
    ...(fields.noUsd ? {} : { marketCapUsd: marketCapSol * MOCK_SOL_USD }),
    curveProgress: fields.curveProgress,
    graduated: fields.graduated ?? false,
  };
}

/** The 20 seed coins, aged relative to `now`. Same seed → same mints. */
export function createSeedCoins(now: number, seed = 0xc01d, network: Network = "devnet"): Coin[] {
  const rand = mulberry32(seed);
  return SEED_COINS.map(({ ageMs, ...rest }) => makeMockCoin(rand, { ...rest, createdAt: now - ageMs, network }));
}

const forklift = (n: number, zoneId: Forklift["zoneId"], position: Forklift["position"], task: Forklift["task"]): Forklift => ({
  id: `forklift-${n}`,
  zoneId,
  position,
  task,
  truckId: null,
});

/**
 * The hub's six forklifts at their home posts: four Launch Bay crew (they
 * unload docked trucks) parked on the open floor in front of the back
 * shelving, and two stacking in the storage halls.
 */
export function createSeedForklifts(): Forklift[] {
  const bay = ZONES["launch-bay"].center;
  const crewPost = (dx: number) => ({ x: bay.x + dx, y: 0, z: bay.z - 3 });
  return [
    forklift(1, "launch-bay", crewPost(-12), "idle"),
    forklift(2, "launch-bay", crewPost(-4), "idle"),
    forklift(3, "launch-bay", crewPost(4), "idle"),
    forklift(4, "launch-bay", crewPost(12), "idle"),
    forklift(5, "storage-b", slotPosition("storage-b", 4), "stacking"),
    forklift(6, "storage-c", slotPosition("storage-c", 3), "stacking"),
  ];
}
