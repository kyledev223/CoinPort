const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A Solana address, or null if missing or malformed (so a typo never becomes a broken link). */
export function parseMint(value: string | undefined): string | null {
  const v = value?.trim();
  return v && BASE58_ADDRESS.test(v) ? v : null;
}

/** An https URL, or null. */
export function parseHttpsUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * CoinPort's own token and socials, shown in the top bar. Public values, set in
 * the host's environment (e.g. Vercel → Settings → Environment Variables):
 *   NEXT_PUBLIC_TOKEN_MINT   the token's contract address (CA)
 *   NEXT_PUBLIC_TWITTER_URL  e.g. https://x.com/yourhandle
 * Unset or invalid values show as "coming soon".
 */
export const PROJECT = {
  tokenMint: parseMint(process.env.NEXT_PUBLIC_TOKEN_MINT),
  twitterUrl: parseHttpsUrl(process.env.NEXT_PUBLIC_TWITTER_URL),
};

/** pump.fun page for the project token (pump.fun lists mainnet coins). */
export function projectPumpFunUrl(mint: string): string {
  return `https://pump.fun/coin/${mint}`;
}
