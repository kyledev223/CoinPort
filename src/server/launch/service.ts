import "server-only";
import { PublicKey, SendTransactionError, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { and, eq, inArray } from "drizzle-orm";
import { toLaunchFormData, validateLaunchForm, type LaunchFormValues } from "@/shared/launchForm";
import { isWalletAddress } from "../auth/signIn";
import { rpcChainReader } from "../chain";
import { getDb } from "../db/client";
import { launches } from "../db/schema";
import { AppError } from "../errors";
import { LIMITS, rateLimit } from "../rateLimit";
import { withRpc } from "../rpc";
import { buildLaunchTransaction, notEnoughSol, type BuiltLaunch } from "./build";
import { createInstructionFor } from "./createInstruction";
import { finalizeLaunch, type LaunchRow } from "./finalize";
import { checkRelayTransaction } from "./relayCheck";
import { normalizeImage, uploadMetadata } from "./upload";

/** What the browser sees about a launch. */
export interface LaunchView {
  id: string;
  status: string;
  mint: string | null;
  signature: string | null;
  error: string | null;
}

const view = (r: LaunchRow): LaunchView => ({ id: r.id, status: r.status, mint: r.mint, signature: r.signature, error: r.error });

async function ownLaunch(wallet: string, id: unknown): Promise<LaunchRow> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("bad-request", "Unknown launch.");
  const db = await getDb();
  const [row] = await db.select().from(launches).where(and(eq(launches.id, id), eq(launches.wallet, wallet))).limit(1);
  if (!row) throw new AppError("not-found", "That launch wasn't found for your wallet.");
  return row;
}

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Step 1 (server): validate, normalise the image, upload metadata, store a pending launch. */
export async function prepareLaunch(wallet: string, ipHash: string, form: FormData): Promise<{ launchId: string; metadataUri: string }> {
  const image = form.get("image");
  const values: LaunchFormValues = {
    image: image instanceof File ? image : null,
    name: field(form, "name"),
    symbol: field(form, "symbol"),
    description: field(form, "description"),
    twitter: field(form, "twitter"),
    telegram: field(form, "telegram"),
    website: field(form, "website"),
  };
  const data = toLaunchFormData(values);
  if (!data) {
    const errors = validateLaunchForm(values);
    throw new AppError("invalid-form", Object.values(errors)[0] ?? "Please check the form.");
  }

  const db = await getDb();
  await rateLimit(db, `prepare:wallet:${wallet}`, LIMITS.prepareWallet);
  await rateLimit(db, `prepare:ip:${ipHash}`, LIMITS.prepareIp);

  const normalized = await normalizeImage(data.image);
  const uploaded = await uploadMetadata({
    image: normalized,
    name: data.name,
    symbol: data.symbol,
    description: data.description,
    twitter: data.twitter,
    telegram: data.telegram,
    website: data.website,
  });

  const [row] = await db
    .insert(launches)
    .values({
      wallet,
      ipHash,
      name: data.name,
      symbol: data.symbol,
      description: data.description,
      twitter: data.twitter ?? null,
      telegram: data.telegram ?? null,
      website: data.website ?? null,
      imageUrl: uploaded.imageUrl,
      metadataUri: uploaded.metadataUri,
      status: "prepared",
    })
    .returning({ id: launches.id });
  return { launchId: row.id, metadataUri: uploaded.metadataUri };
}

/** Step 3 (server): build and simulate the create transaction for the browser-generated mint. */
export async function buildLaunch(wallet: string, launchId: unknown, mint: unknown): Promise<BuiltLaunch> {
  const row = await ownLaunch(wallet, launchId);
  if (!isWalletAddress(mint)) throw new AppError("bad-request", "That mint address isn't valid.");
  if (row.status !== "prepared" && row.status !== "built") {
    throw new AppError("bad-request", `This launch is already ${row.status}.`);
  }
  const db = await getDb();
  const [clash] = await db.select({ id: launches.id }).from(launches).where(eq(launches.mint, mint)).limit(1);
  if (clash && clash.id !== row.id) throw new AppError("bad-request", "That mint address is already in use. Please try again.");

  const built = await buildLaunchTransaction({ wallet, mint, name: row.name, symbol: row.symbol, metadataUri: row.metadataUri });
  await db
    .update(launches)
    .set({ mint, status: "built", lastValidBlockHeight: built.lastValidBlockHeight, error: null, updatedAt: new Date() })
    .where(eq(launches.id, row.id));
  return built;
}

/** Pulls the useful text out of a send failure (SendTransactionError's message and logs). */
function sendFailureText(err: unknown): { message: string; logs: string[] } {
  if (err instanceof SendTransactionError) {
    const { message, logs } = err.transactionError;
    return { message, logs: logs ?? err.logs ?? [] };
  }
  return { message: err instanceof Error ? err.message : String(err), logs: [] };
}

/** Step 5 (server): check the signed transaction matches this launch, then send it. */
export async function relayLaunch(wallet: string, launchId: unknown, transaction: unknown): Promise<{ signature: string }> {
  const row = await ownLaunch(wallet, launchId);
  if (row.status !== "built" || !row.mint) throw new AppError("bad-request", "This launch isn't ready to send. Please start again.");
  if (typeof transaction !== "string") throw new AppError("bad-request", "Missing signed transaction.");

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(transaction, "base64"));
  } catch {
    throw new AppError("bad-request", "The signed transaction couldn't be read.");
  }
  checkRelayTransaction(tx, {
    feePayer: new PublicKey(wallet),
    mint: new PublicKey(row.mint),
    createInstruction: await createInstructionFor({ wallet, mint: row.mint, name: row.name, symbol: row.symbol, metadataUri: row.metadataUri }),
  });

  const signature = bs58.encode(tx.signatures[0]);
  const db = await getDb();
  try {
    await withRpc((c) => c.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 }));
  } catch (err) {
    if (err instanceof AppError) throw err; // RPC unreachable / rate-limited
    const { message, logs } = sendFailureText(err);
    const text = `${message}\n${logs.join("\n")}`;
    if (/blockhash not found|block height exceeded|BlockhashNotFound/i.test(text)) {
      // Nothing landed: let the user approve a fresh transaction.
      await db.update(launches).set({ status: "prepared", mint: null, updatedAt: new Date() }).where(eq(launches.id, row.id));
      throw new AppError("blockhash-expired", "That approval expired before it was sent. Nothing was charged. Please approve again.");
    }
    if (/insufficient lamports|insufficient funds|no record of a prior credit|AccountNotFound/i.test(text)) {
      throw await withRpc((c) => notEnoughSol(c, new PublicKey(wallet)));
    }
    // An empty wallet often fails without a clear error: check the balance before giving up.
    const balance = await withRpc((c) => c.getBalance(new PublicKey(wallet), "confirmed")).catch(() => null);
    if (balance !== null && balance < 15_000_000) throw await withRpc((c) => notEnoughSol(c, new PublicKey(wallet)));
    throw new AppError("tx-rejected", "The network rejected the launch transaction. Nothing was created.", logs.slice(-6).join("\n") || message);
  }

  await db.update(launches).set({ status: "sent", signature, updatedAt: new Date() }).where(eq(launches.id, row.id));
  return { signature };
}

/** Step 6: status for the launching browser's polls. Finalizes the launch on the way. */
export async function launchStatus(wallet: string, launchId: unknown): Promise<LaunchView> {
  const row = await ownLaunch(wallet, launchId);
  if (row.status !== "sent") return view(row);
  const db = await getDb();
  const updated = await finalizeLaunch(db, row.id, rpcChainReader);
  return view(updated ?? row);
}

/** For the background tick: finalize every launch still waiting for confirmation. */
export async function finalizePending(limit = 25): Promise<number> {
  const db = await getDb();
  const pending = await db.select({ id: launches.id }).from(launches).where(inArray(launches.status, ["sent"])).limit(limit);
  for (const { id } of pending) {
    try {
      await finalizeLaunch(db, id, rpcChainReader);
    } catch (err) {
      console.warn("[coinport] finalize failed for", id, err instanceof Error ? err.message : err);
    }
  }
  return pending.length;
}
