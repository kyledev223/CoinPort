import "server-only";
import { Connection } from "@solana/web3.js";
import { env, hostOf } from "./env";
import { AppError } from "./errors";

/**
 * Every Solana RPC call goes through `withRpc`: try each endpoint in order
 * (SOLANA_RPC_URL entries, then the public one), retry once on rate limits,
 * 403s, timeouts and network errors, then fail over. Real errors (a rejected
 * transaction, a bad request) are thrown straight away: retrying them would
 * not help. Errors and logs only ever name hostnames, never full URLs.
 */

export type RpcFailure = "rate-limited" | "forbidden" | "timeout" | "network" | "other";

export function classifyRpcError(err: unknown): RpcFailure {
  const text = `${(err as { message?: string })?.message ?? err} ${(err as { code?: string | number })?.code ?? ""}`;
  if (/\b429\b|too many requests|rate.?limit/i.test(text)) return "rate-limited";
  if (/\b403\b|forbidden|access denied|not allowed/i.test(text)) return "forbidden";
  if (/timeout|timed out|ETIMEDOUT|AbortError|aborted/i.test(text)) return "timeout";
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|\b50[234]\b/i.test(text)) return "network";
  return "other";
}

const RETRYABLE = new Set<RpcFailure>(["rate-limited", "forbidden", "timeout", "network"]);
const TIMEOUT_MS = 15_000;

const connections = new Map<string, Connection>();

function connectionFor(url: string): Connection {
  let c = connections.get(url);
  if (!c) {
    c = new Connection(url, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true, // we fail over instead of waiting
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    });
    connections.set(url, c);
  }
  return c;
}

export interface RpcOptions {
  /** Override endpoints (tests). */
  urls?: string[];
  /** Override how a connection is made (tests). */
  connect?: (url: string) => Connection;
  /** Pause before the single retry on the same endpoint. */
  retryDelayMs?: number;
}

export async function withRpc<T>(fn: (connection: Connection, host: string) => Promise<T>, options: RpcOptions = {}): Promise<T> {
  const urls = options.urls ?? env.rpcUrls;
  const connect = options.connect ?? connectionFor;
  const delay = options.retryDelayMs ?? 300;
  const failures: Array<{ host: string; kind: RpcFailure }> = [];

  for (const url of urls) {
    const host = hostOf(url);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn(connect(url), host);
      } catch (err) {
        const kind = classifyRpcError(err);
        if (!RETRYABLE.has(kind)) throw err;
        failures.push({ host, kind });
        if (attempt === 0) await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const summary = failures.map((f) => `${f.host}: ${f.kind}`).join(", ");
  const allRateLimited = failures.length > 0 && failures.every((f) => f.kind === "rate-limited" || f.kind === "forbidden");
  console.warn(`[coinport] all RPC endpoints failed (${summary})`);
  throw allRateLimited
    ? new AppError("rpc-rate-limited", "The Solana network is rate-limiting us right now. Please try again in a minute.", summary)
    : new AppError("rpc-unavailable", "We couldn't reach the Solana network. Please try again in a minute.", summary);
}
