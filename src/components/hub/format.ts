/** Display formatting for the overlay UI. */

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function formatAgo(ms: number): string {
  return ms < 1000 ? "just now" : `${formatAge(ms)} ago`;
}

export function formatSol(sol: number): string {
  const digits = sol >= 1000 ? 0 : sol >= 100 ? 1 : 2;
  return `${sol.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} SOL`;
}

export function formatUsd(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

export function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}
