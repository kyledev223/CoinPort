import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { createHash, randomBytes } from "node:crypto";

/** Pure sign-in helpers: message format, signature check, token hashing. */

export const NONCE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
export const SESSION_COOKIE = "cp_session";

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isWalletAddress(value: unknown): value is string {
  if (typeof value !== "string" || !BASE58_ADDRESS.test(value)) return false;
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Sessions are stored by this hash, so a database leak doesn't leak usable cookies. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`coinport:${ip}`).digest("hex").slice(0, 32);
}

/** The message the wallet signs. It names the site and expires, so it can't be replayed elsewhere. */
export function signInMessage(p: { domain: string; wallet: string; nonce: string; issuedAt: Date }): string {
  return [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.wallet,
    "",
    "Sign in to CoinPort to launch coins. This does not send a transaction or cost anything.",
    "",
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt.toISOString()}`,
  ].join("\n");
}

/** Verifies an ed25519 signature (base58) over `message` by `wallet`. */
export function verifyWalletSignature(message: string, signatureBase58: string, wallet: string): boolean {
  try {
    const signature = bs58.decode(signatureBase58);
    const publicKey = bs58.decode(wallet);
    if (signature.length !== 64 || publicKey.length !== 32) return false;
    return ed25519.verify(signature, new TextEncoder().encode(message), publicKey);
  } catch {
    return false;
  }
}
