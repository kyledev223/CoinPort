import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { testDb } from "../../test/db";
import { isWalletAddress, signInMessage, verifyWalletSignature } from "./auth/signIn";
import { AppError } from "./errors";
import { fetchSolUsd } from "./price";
import { rateLimit } from "./rateLimit";
import { acquireLock } from "./tick";

describe("wallet sign-in signatures", () => {
  const secret = ed25519.utils.randomSecretKey();
  const wallet = bs58.encode(ed25519.getPublicKey(secret));
  const message = signInMessage({ domain: "coinport.example", wallet, nonce: "abc123", issuedAt: new Date(0) });
  const signature = bs58.encode(ed25519.sign(new TextEncoder().encode(message), secret));

  it("accepts the wallet's own signature of the message", () => {
    expect(isWalletAddress(wallet)).toBe(true);
    expect(verifyWalletSignature(message, signature, wallet)).toBe(true);
  });

  it("rejects a changed message, another wallet, or garbage", () => {
    expect(verifyWalletSignature(message.replace("abc123", "zzz999"), signature, wallet)).toBe(false);
    const other = bs58.encode(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));
    expect(verifyWalletSignature(message, signature, other)).toBe(false);
    expect(verifyWalletSignature(message, "not-base58!!", wallet)).toBe(false);
    expect(isWalletAddress("0xabc")).toBe(false);
  });
});

describe("rate limits", () => {
  it("allows up to the limit per window, then refuses", async () => {
    const db = await testDb();
    const rule = { limit: 3, windowMs: 60_000 };
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) await rateLimit(db, "prepare:wallet:A", rule, now);
    await expect(rateLimit(db, "prepare:wallet:A", rule, now)).rejects.toMatchObject({ code: "rate-limited" });
    // Other keys and the next window are unaffected.
    await expect(rateLimit(db, "prepare:wallet:B", rule, now)).resolves.toBeUndefined();
    await expect(rateLimit(db, "prepare:wallet:A", rule, now + 60_000)).resolves.toBeUndefined();
  });
});

describe("background job lock", () => {
  it("lets only one runner hold it until it expires", async () => {
    const db = await testDb();
    expect(await acquireLock(db, "tick", 60_000)).toBe(true);
    expect(await acquireLock(db, "tick", 60_000)).toBe(false);
  });
});

describe("SOL price", () => {
  it("falls back through sources", async () => {
    const failing = { name: "coingecko", fetch: async () => Promise.reject(new Error("429")) };
    const ok = { name: "coinbase", fetch: async () => 151.2 };
    await expect(fetchSolUsd([failing, ok])).resolves.toEqual({ usd: 151.2, source: "coinbase" });
    await expect(fetchSolUsd([failing])).rejects.toThrow(/no SOL price/);
  });
});

describe("errors", () => {
  it("maps codes to HTTP statuses", () => {
    expect(new AppError("insufficient-funds", "x").status).toBe(400);
    expect(new AppError("rpc-rate-limited", "x").status).toBe(503);
    expect(new AppError("not-signed-in", "x").status).toBe(401);
  });
});
