import { Keypair } from "@solana/web3.js";
import { sql } from "drizzle-orm";
import { NextResponse, connection } from "next/server";
import { databaseConfigured, getDb } from "@/server/db/client";
import { env, hostOf } from "@/server/env";
import { PUMP_IPFS_URL } from "@/server/launch/upload";
import { fetchSolUsd, storedSolPrice } from "@/server/price";
import { pumpSdk } from "@/server/pump";
import { withRpc } from "@/server/rpc";
import { jobStatus } from "@/server/tick";

export const maxDuration = 30;

type Check = { ok: boolean; ms: number; detail?: string };

async function timed(fn: () => Promise<string | void>): Promise<Check> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - start, ...(detail ? { detail } : {}) };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}

/** GET → { ok, checks, hints }. No secrets in the output: RPC endpoints are shown by hostname only. */
export async function GET() {
  await connection();
  const hints: string[] = [];

  const database = databaseConfigured()
    ? await timed(async () => {
        await (await getDb()).execute(sql`select 1`);
      })
    : { ok: false, ms: 0, detail: "not configured" };
  if (!databaseConfigured()) hints.push("DATABASE_URL is not set. Add a Neon Postgres database in Vercel → Storage, then redeploy.");
  else if (!database.ok) hints.push("The database didn't answer. Check DATABASE_URL and that the build ran migrations (npm run vercel-build).");

  const rpc = await Promise.all(
    env.rpcUrls.map(async (url) => ({
      host: hostOf(url),
      ...(await timed(async () => {
        const { blockhash } = await withRpc((c) => c.getLatestBlockhash("confirmed"), { urls: [url], retryDelayMs: 0 });
        return `blockhash ${blockhash.slice(0, 8)}...`;
      })),
    })),
  );
  if (!env.rpcConfigured) hints.push("SOLANA_RPC_URL is not set. The public endpoint rate-limits and often refuses Vercel; add a Helius mainnet URL.");
  if (!rpc.some((r) => r.ok)) hints.push("No Solana RPC endpoint answered. Check SOLANA_RPC_URL (and that the API key is valid).");

  const pumpSdkCheck = await timed(async () => {
    const user = Keypair.generate().publicKey;
    const ix = await pumpSdk().PUMP_SDK.createV2Instruction({
      mint: Keypair.generate().publicKey,
      name: "Health",
      symbol: "HLTH",
      uri: "https://example.com/health.json",
      creator: user,
      user,
      mayhemMode: false,
    });
    return `create instruction: ${ix.keys.length} accounts`;
  });
  if (!pumpSdkCheck.ok) hints.push("The pump SDK failed to load on the server. Check serverExternalPackages and the uuid override in package.json.");

  const ipfs = await timed(async () => {
    // A GET is enough to prove reachability; uploads are POSTs.
    const res = await fetch(PUMP_IPFS_URL, { method: "GET", signal: AbortSignal.timeout(8_000) });
    if (res.status >= 500 && res.status !== 501) throw new Error(`answered ${res.status}`);
    return `answered ${res.status}`;
  });
  const pinata = env.pinataJwt
    ? await timed(async () => {
        const res = await fetch("https://api.pinata.cloud/data/testAuthentication", {
          headers: { Authorization: `Bearer ${env.pinataJwt}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`answered ${res.status}`);
      })
    : null;
  if (!ipfs.ok && !pinata?.ok) hints.push("pump.fun's upload endpoint isn't reachable from the server. Set PINATA_JWT as a fallback.");
  if (pinata && !pinata.ok) hints.push("PINATA_JWT is set but Pinata rejected it. Create a new API key (JWT) in Pinata.");

  const solPrice = await timed(async () => {
    const { usd, source } = await fetchSolUsd();
    return `$${usd.toFixed(2)} from ${source}`;
  });
  if (!solPrice.ok) hints.push("No SOL/USD price source answered; market caps will show in SOL only.");

  let jobs: Record<string, unknown> | null = null;
  if (database.ok) {
    const db = await getDb();
    const [job, stored] = await Promise.all([jobStatus(db), storedSolPrice(db)]);
    jobs = {
      lastRunAt: job?.lastRunAt ?? null,
      lastOkAt: job?.lastOkAt ?? null,
      lastError: job?.lastError ?? null,
      storedSolPriceAt: stored ? new Date(stored.at).toISOString() : null,
    };
    if (!job?.lastOkAt) hints.push("Background jobs haven't completed yet. They run on /api/cron, on coin feed requests and on launch status polls.");
  }
  if (!env.cronSecret) hints.push("CRON_SECRET is not set, so /api/cron is disabled.");
  if (!env.siteUrl) hints.push("SITE_URL is not set; the wallet sign-in message will use the request's host.");

  const ok = database.ok && rpc.some((r) => r.ok) && pumpSdkCheck.ok && (ipfs.ok || Boolean(pinata?.ok));
  return NextResponse.json(
    { ok, network: "mainnet", checks: { database, rpc, pumpSdk: pumpSdkCheck, ipfs, pinata, solPrice }, jobs, hints },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
