import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLaunchHandler, type LaunchWallet } from "./launchFlow";
import { base64ToBytes, bytesToBase64 } from "./api";

const owner = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();
const png = new File([new Uint8Array(8)], "logo.png", { type: "image/png" });
const DATA = { image: png, name: "Frog Fuel", symbol: "FROG", description: "Ribbit." };

/** A wallet backed by a local keypair. Records whether the mint had already signed when it was asked. */
function fakeWallet(opts: { reject?: boolean } = {}) {
  const seen: Array<{ mintAlreadySigned: boolean }> = [];
  const wallet: LaunchWallet = {
    publicKey: owner.publicKey,
    signMessage: async (msg) => ed25519.sign(msg, owner.secretKey.slice(0, 32)),
    signTransaction: async (tx) => {
      if (opts.reject) throw Object.assign(new Error("User rejected the request."), { name: "WalletSignTransactionError" });
      seen.push({ mintAlreadySigned: tx.signatures.slice(1).some((s) => s.some((b) => b !== 0)) });
      tx.sign([owner]);
      return tx;
    },
  };
  return { wallet, seen };
}

/** Fake CoinPort API. `build` makes a transaction that needs the wallet and the mint to sign. */
function fakeApi(opts: { expireFirstRelay?: boolean } = {}) {
  const relayed: VersionedTransaction[] = [];
  let relays = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (url === "/api/auth/me") return json({ wallet: null });
      if (url === "/api/auth/nonce") return json({ nonce: "n1", message: "sign in" });
      if (url === "/api/auth/verify") return json({ wallet: owner.publicKey.toBase58() });
      if (url === "/api/launch/prepare") return json({ launchId: "11111111-1111-1111-1111-111111111111" });
      if (url === "/api/launch/build") {
        const mint = new PublicKey(body.mint);
        const ix = SystemProgram.createAccount({ fromPubkey: owner.publicKey, newAccountPubkey: mint, lamports: 1, space: 0, programId: SystemProgram.programId });
        const msg = new TransactionMessage({ payerKey: owner.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToLegacyMessage();
        return json({ transaction: bytesToBase64(new VersionedTransaction(msg).serialize()), lastValidBlockHeight: 10, costLamports: 21_000_000 });
      }
      if (url === "/api/launch/relay") {
        relays++;
        if (opts.expireFirstRelay && relays === 1) return json({ error: { code: "blockhash-expired", message: "expired" } }, 409);
        relayed.push(VersionedTransaction.deserialize(base64ToBytes(body.transaction)));
        return json({ signature: "sig" });
      }
      if (url.startsWith("/api/launch/")) {
        const tx = relayed.at(-1)!;
        return json({ status: "confirmed", mint: tx.message.staticAccountKeys[1].toBase58(), error: null });
      }
      return json({ error: { code: "not-found", message: url } }, 404);
    }),
  );
  return { relayed };
}

const verifies = (tx: VersionedTransaction) =>
  tx.signatures.every((sig, i) => ed25519.verify(sig, tx.message.serialize(), tx.message.staticAccountKeys[i].toBytes()));

describe("launch flow (browser side)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("signs in, has the wallet sign first, adds the mint's signature, relays, and returns the mint", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { relayed } = fakeApi();
    const { wallet, seen } = fakeWallet();
    const approved = vi.fn();
    const quoted = vi.fn();
    const run = createLaunchHandler(() => wallet)(DATA, { approved, quoted });
    await vi.runAllTimersAsync();
    const { mint } = await run;

    expect(seen).toEqual([{ mintAlreadySigned: false }]); // the wallet signed before the mint
    expect(relayed).toHaveLength(1);
    expect(verifies(relayed[0])).toBe(true); // both signatures present and valid
    expect(mint).toBe(relayed[0].message.staticAccountKeys[1].toBase58());
    expect(approved).toHaveBeenCalledOnce();
    expect(quoted).toHaveBeenCalledWith(21_000_000);
  });

  it("rebuilds and asks the wallet again once when an approval expires", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { relayed } = fakeApi({ expireFirstRelay: true });
    const { wallet, seen } = fakeWallet();
    const run = createLaunchHandler(() => wallet)(DATA, { approved: () => {} });
    await vi.runAllTimersAsync();
    await run;
    expect(seen).toHaveLength(2);
    expect(relayed).toHaveLength(1);
  });

  it("explains a declined wallet request", async () => {
    fakeApi();
    const { wallet } = fakeWallet({ reject: true });
    await expect(createLaunchHandler(() => wallet)(DATA, { approved: () => {} })).rejects.toThrow(/declined in your wallet/);
  });

  it("asks for a wallet before anything else", async () => {
    const api = fakeApi();
    await expect(createLaunchHandler(() => ({ publicKey: null }))(DATA, { approved: () => {} })).rejects.toThrow(/Connect your wallet/);
    expect(api.relayed).toHaveLength(0);
  });
});
