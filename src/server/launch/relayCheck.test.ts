import { createRequire } from "node:module";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, type TransactionInstruction } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../errors";
import { checkRelayTransaction } from "./relayCheck";

const require = createRequire(import.meta.url);
const { PUMP_SDK } = require("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");

const user = Keypair.generate();
const mint = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();
const LAUNCH = { name: "Frog Fuel", symbol: "FROG", uri: "https://ipfs.io/ipfs/QmFrog" };

const createIx = (o: Partial<{ mint: Keypair; name: string; symbol: string; uri: string }> = {}) =>
  PUMP_SDK.createV2Instruction({
    mint: (o.mint ?? mint).publicKey,
    name: o.name ?? LAUNCH.name,
    symbol: o.symbol ?? LAUNCH.symbol,
    uri: o.uri ?? LAUNCH.uri,
    creator: user.publicKey,
    user: user.publicKey,
    mayhemMode: false,
  });

function signed(instructions: TransactionInstruction[], signers: Keypair[] = [user, mint], payer = user): VersionedTransaction {
  const msg = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions }).compileToLegacyMessage();
  const tx = new VersionedTransaction(msg);
  tx.sign(signers);
  return tx;
}

const budget = () => [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })];

let expected: TransactionInstruction;
const expectation = () => ({ feePayer: user.publicKey, mint: mint.publicKey, createInstruction: expected });

function rejection(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("relay-rejected");
    return (err as AppError).detail ?? "";
  }
  throw new Error("expected the relay check to reject");
}

describe("checkRelayTransaction", () => {
  beforeAll(async () => {
    expected = await createIx();
  });

  it("accepts ComputeBudget + the exact create, signed by the wallet then the mint", async () => {
    const tx = signed([...budget(), await createIx()]);
    expect(() => checkRelayTransaction(tx, expectation())).not.toThrow();
  });

  it("rejects a different fee payer", async () => {
    const other = Keypair.generate();
    const tx = signed([...budget(), await createIx()], [other, user, mint], other);
    expect(rejection(() => checkRelayTransaction(tx, expectation()))).toMatch(/fee payer/);
  });

  it("rejects extra instructions, such as a transfer out of the wallet", async () => {
    const drain = SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1_000_000 });
    const tx = signed([...budget(), await createIx(), drain]);
    expect(rejection(() => checkRelayTransaction(tx, expectation()))).toMatch(/not allowed/);
  });

  it("rejects a second create, or none", async () => {
    expect(rejection(() => checkRelayTransaction(signed([...budget(), expected, expected]), expectation()))).toMatch(/exactly one create/);
    expect(rejection(() => checkRelayTransaction(signed(budget(), [user]), expectation()))).toMatch(/signers|exactly one create/);
  });

  it("rejects a mismatched mint", async () => {
    const otherMint = Keypair.generate();
    const tx = signed([...budget(), await createIx({ mint: otherMint })], [user, otherMint]);
    expect(rejection(() => checkRelayTransaction(tx, expectation()))).toMatch(/signers|doesn't match/);
  });

  it("rejects a mismatched URI, name or symbol", async () => {
    for (const o of [{ uri: "https://evil.example/meta.json" }, { name: "Not Frog" }, { symbol: "SCAM" }]) {
      const tx = signed([...budget(), await createIx(o)]);
      expect(rejection(() => checkRelayTransaction(tx, expectation()))).toMatch(/doesn't match/);
    }
  });

  it("rejects a missing mint signature", async () => {
    const msg = new TransactionMessage({ payerKey: user.publicKey, recentBlockhash: blockhash, instructions: [...budget(), expected] }).compileToLegacyMessage();
    const tx = new VersionedTransaction(msg);
    tx.sign([user]);
    expect(rejection(() => checkRelayTransaction(tx, expectation()))).toMatch(/missing signature/);
  });

  it("rejects a forged signature", async () => {
    const tx = signed([...budget(), expected]);
    tx.signatures[1] = new Uint8Array(64).fill(7);
    expect(rejection(() => checkRelayTransaction(tx, expectation()))).toMatch(/invalid signature/);
  });

  it("rejects unexpected compute budget instructions and duplicates", async () => {
    const heap = ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 });
    expect(rejection(() => checkRelayTransaction(signed([...budget(), heap, expected]), expectation()))).toMatch(/compute budget/);
    const twice = [...budget(), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }), expected];
    expect(rejection(() => checkRelayTransaction(signed(twice), expectation()))).toMatch(/compute budget/);
  });
});
