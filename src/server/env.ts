import "server-only";

/**
 * Server configuration, read from the environment. Secrets live only here
 * (never NEXT_PUBLIC_). Values are read lazily so a missing optional value
 * never breaks the build.
 */

/** Public mainnet RPC: always the last fallback. It rate-limits and often refuses cloud hosts. */
export const PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";

export const env = {
  /** Postgres connection string (Neon in production). `pglite:<dir>` runs an embedded database for local development. */
  get databaseUrl(): string | null {
    return process.env.DATABASE_URL?.trim() || null;
  },
  /** RPC endpoints in priority order: SOLANA_RPC_URL (comma-separated), then the public endpoint. */
  get rpcUrls(): string[] {
    const configured = (process.env.SOLANA_RPC_URL ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return [...configured.filter((u) => u !== PUBLIC_RPC_URL), PUBLIC_RPC_URL];
  },
  get rpcConfigured(): boolean {
    return (process.env.SOLANA_RPC_URL ?? "").split(",").some((s) => s.trim() && s.trim() !== PUBLIC_RPC_URL);
  },
  /** Public site address, used in the wallet sign-in message. */
  get siteUrl(): string | null {
    const raw = process.env.SITE_URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    return raw ? raw.replace(/\/+$/, "") : null;
  },
  get cronSecret(): string | null {
    return process.env.CRON_SECRET?.trim() || null;
  },
  get pinataJwt(): string | null {
    return process.env.PINATA_JWT?.trim() || null;
  },
  get coingeckoApiKey(): string | null {
    return process.env.COINGECKO_API_KEY?.trim() || null;
  },
};

/** Hostname only, for logs and health output: never print a URL that may contain an API key. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}
