/** Tunable game constants. Durations are milliseconds; market caps are SOL. */

/**
 * Market cap (SOL) at which a stored coin moves up a storage tier.
 * Below `growth` is Tier 1 (Storage A), from `growth` is Tier 2 (Storage B),
 * from `elite` is Tier 3 (Storage C).
 *
 * For scale: a pump.fun bonding curve starts near 28 SOL market cap and
 * completes near 411 SOL. Thresholds are in SOL, not USD, so tiers don't
 * shuffle when the SOL price moves.
 */
export const TIER_THRESHOLDS_SOL = {
  growth: 50,
  elite: 150,
} as const;

/** Number of loading docks in the Launch Bay. */
export const DOCK_COUNT = 6;

/** Time from launch until the truck is through the Entry Gate and can take a dock. */
export const ARRIVE_MS = 5_000;
/** Time to drive from the gate or Yard to the dock and back in. */
export const DOCK_MS = 10_000;
/** Time to unload at the dock before the coin is stored. */
export const UNLOAD_MS = 25_000;
/** Full intake (arrive + dock + unload). Coins older than this on first sight start stored. */
export const INTAKE_MS = ARRIVE_MS + DOCK_MS + UNLOAD_MS;
/**
 * Longest a truck waits in the Yard for a free dock before it is sent
 * straight to storage. Keeps the queue bounded when launches outpace docks.
 */
export const YARD_MAX_WAIT_MS = 60_000;
/** Shortest haul to the Graduation Gate, so a fast migration still shows the drive. */
export const MIN_HAUL_MS = 8_000;
/** How long a graduated truck stays at the Graduation Gate before departing. */
export const GRADUATION_DWELL_MS = 15_000;

/** Window for the "coins launched" HUD stat. */
export const LAUNCH_STATS_WINDOW_MS = 24 * 60 * 60 * 1000;
