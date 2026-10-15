import { ed25519 } from "@noble/curves/ed25519.js";
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  type PublicKey,
  TransactionMessage,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { AppError } from "../errors";

/**
 * Checks a signed launch transaction before the server relays it, so the
 * relay can't be used to send anything else:
 * - the fee payer is the signed-in wallet,
 * - the only signers are that wallet and this launch's mint,
 * - the instructions are ComputeBudget (unit limit / price, at most one each)
 *   plus exactly one pump create that matches, byte for byte and account for
 *   account, the one the server builds for this launch (mint, name, symbol, URI),
 * - every signature is present and valid.
 * Throws AppError("relay-rejected") with the reason.
 */
export interface RelayExpectation {
  feePayer: PublicKey;
  mint: PublicKey;
  /** The create instruction the server would build for this launch. */
  createInstruction: TransactionInstruction;
}

const ALLOWED_COMPUTE_BUDGET = new Set(["SetComputeUnitLimit", "SetComputeUnitPrice"]);

function reject(reason: string): never {
  throw new AppError("relay-rejected", "This transaction doesn't match your launch, so we didn't send it.", reason);
}

function sameInstruction(a: TransactionInstruction, b: TransactionInstruction): boolean {
  if (!a.programId.equals(b.programId) || !a.data.equals(b.data) || a.keys.length !== b.keys.length) return false;
  return a.keys.every((k, i) => k.pubkey.equals(b.keys[i].pubkey) && k.isSigner === b.keys[i].isSigner && k.isWritable === b.keys[i].isWritable);
}

export function checkRelayTransaction(tx: VersionedTransaction, expect: RelayExpectation): void {
  const message = tx.message;
  if ("addressTableLookups" in message && message.addressTableLookups.length > 0) reject("address lookup tables are not allowed");

  const keys = message.staticAccountKeys;
  if (!keys[0]?.equals(expect.feePayer)) reject("fee payer is not the signed-in wallet");

  // Signers: exactly the wallet and the mint.
  const required = message.header.numRequiredSignatures;
  const signers = keys.slice(0, required);
  const allowedSigners = [expect.feePayer, expect.mint];
  if (signers.length !== 2 || !signers.every((s) => allowedSigners.some((a) => a.equals(s)))) {
    reject(`unexpected signers: ${signers.map((s) => s.toBase58()).join(", ")}`);
  }

  // Instructions.
  let instructions: TransactionInstruction[];
  try {
    instructions = TransactionMessage.decompile(message).instructions;
  } catch {
    reject("could not read the instructions");
  }
  const seenBudget = new Set<string>();
  let creates = 0;
  for (const ix of instructions) {
    if (ix.programId.equals(ComputeBudgetProgram.programId)) {
      let type: string;
      try {
        type = ComputeBudgetInstruction.decodeInstructionType(ix);
      } catch {
        reject("unreadable compute budget instruction");
      }
      if (!ALLOWED_COMPUTE_BUDGET.has(type) || seenBudget.has(type)) reject(`compute budget instruction not allowed: ${type}`);
      seenBudget.add(type);
      continue;
    }
    if (sameInstruction(ix, expect.createInstruction)) {
      creates++;
      continue;
    }
    if (ix.programId.equals(expect.createInstruction.programId)) reject("pump instruction doesn't match this launch (mint, name, symbol or URI)");
    reject(`instruction for program ${ix.programId.toBase58()} is not allowed`);
  }
  if (creates !== 1) reject(`expected exactly one create instruction, found ${creates}`);

  // Signatures.
  const signed = message.serialize();
  for (let i = 0; i < required; i++) {
    const sig = tx.signatures[i];
    if (!sig || sig.every((b) => b === 0)) reject(`missing signature for ${keys[i].toBase58()}`);
    let ok = false;
    try {
      ok = ed25519.verify(sig, signed, keys[i].toBytes());
    } catch {
      ok = false;
    }
    if (!ok) reject(`invalid signature for ${keys[i].toBase58()}`);
  }
}

