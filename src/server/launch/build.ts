import "server-only";
import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { AppError } from "../errors";
import { withRpc } from "../rpc";
import { createInstructionFor } from "./createInstruction";

/** Simulation budget; the final limit is sized from what the simulation used. */
const SIMULATION_CU_LIMIT = 400_000;
const MIN_CU_LIMIT = 120_000;
const MAX_CU_LIMIT = 600_000;
/** Priority fee bounds (micro-lamports per compute unit). */
const MIN_PRIORITY = 20_000;
const MAX_PRIORITY = 1_000_000;
const DEFAULT_PRIORITY = 100_000;
/** What we tell users to keep in their wallet: rent for the new accounts plus fees, with headroom. */
export const SUGGESTED_BALANCE_SOL = 0.03;

export interface BuiltLaunch {
  /** Unsigned transaction, base64. The wallet signs it first, then the browser adds the mint's signature. */
  transaction: string;
  lastValidBlockHeight: number;
  /** What the wallet will pay, from the simulation (rent + fees). */
  costLamports: number;
}

function isInsufficientFunds(err: unknown, logs: readonly string[] | null | undefined): boolean {
  const text = `${JSON.stringify(err)} ${(logs ?? []).join("\n")}`;
  return /insufficient lamports|InsufficientFunds|AccountNotFound|no record of a prior credit|insufficient funds/i.test(text);
}

export async function notEnoughSol(connection: Connection, wallet: PublicKey, neededLamports?: number): Promise<AppError> {
  let balance: number | null = null;
  try {
    balance = await connection.getBalance(wallet, "confirmed");
  } catch {
    balance = null;
  }
  const needs = neededLamports ? (neededLamports / LAMPORTS_PER_SOL).toFixed(4) : SUGGESTED_BALANCE_SOL.toFixed(2);
  const has = balance !== null ? ` Your wallet has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.` : "";
  return new AppError("insufficient-funds", `Not enough SOL. Launching needs about ${needs} SOL for rent and fees.${has}`);
}

async function priorityFee(connection: Connection, programId: PublicKey): Promise<number> {
  try {
    const recent = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: [programId] });
    const fees = recent.map((r) => r.prioritizationFee).filter((f) => f > 0).sort((a, b) => a - b);
    if (fees.length === 0) return DEFAULT_PRIORITY;
    const p75 = fees[Math.floor(fees.length * 0.75)];
    return Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, p75));
  } catch {
    return DEFAULT_PRIORITY;
  }
}

function compile(payer: PublicKey, blockhash: string, cuLimit: number, priority: number, create: TransactionInstruction) {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priority }),
      create,
    ],
  }).compileToLegacyMessage();
  return new VersionedTransaction(message);
}

/**
 * Builds the create transaction (fee payer = the user's wallet, fresh
 * blockhash, ComputeBudget limit + priority fee) and simulates it. A wallet
 * without enough SOL gets a clear "not enough SOL" here, before it is asked
 * to sign anything.
 */
export async function buildLaunchTransaction(launch: { wallet: string; mint: string; name: string; symbol: string; metadataUri: string }): Promise<BuiltLaunch> {
  const payer = new PublicKey(launch.wallet);
  const create = await createInstructionFor(launch);

  const { blockhash, lastValidBlockHeight } = await withRpc((c) => c.getLatestBlockhash("confirmed"));
  const priority = await withRpc((c) => priorityFee(c, create.programId)).catch(() => DEFAULT_PRIORITY);

  const draft = compile(payer, blockhash, SIMULATION_CU_LIMIT, priority, create);
  const [balanceBefore, sim] = await withRpc((c) =>
    Promise.all([
      c.getBalance(payer, "confirmed"),
      c.simulateTransaction(draft, {
        sigVerify: false,
        commitment: "confirmed",
        accounts: { encoding: "base64", addresses: [payer.toBase58()] },
      }),
    ]),
  );

  if (sim.value.err) {
    if (isInsufficientFunds(sim.value.err, sim.value.logs)) throw await withRpc((c) => notEnoughSol(c, payer));
    const tail = (sim.value.logs ?? []).slice(-6).join("\n");
    throw new AppError("simulation-failed", "The launch transaction failed a dry run, so nothing was sent.", tail || JSON.stringify(sim.value.err));
  }

  const used = sim.value.unitsConsumed ?? 200_000;
  const cuLimit = Math.min(MAX_CU_LIMIT, Math.max(MIN_CU_LIMIT, Math.ceil(used * 1.2) + 10_000));
  const after = sim.value.accounts?.[0]?.lamports;
  const costLamports = typeof after === "number" ? Math.max(0, balanceBefore - after) : 0;

  const tx = compile(payer, blockhash, cuLimit, priority, create);
  return { transaction: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight, costLamports };
}
