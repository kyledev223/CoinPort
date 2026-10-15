import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../db/client";
import { nonces, sessions } from "../db/schema";
import { AppError } from "../errors";
import {
  NONCE_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  hashToken,
  isWalletAddress,
  newNonce,
  newSessionToken,
  signInMessage,
  verifyWalletSignature,
} from "./signIn";

/** Starts a sign-in: stores a one-time nonce and returns the message to sign. */
export async function startSignIn(wallet: string, domain: string): Promise<{ nonce: string; message: string }> {
  if (!isWalletAddress(wallet)) throw new AppError("bad-request", "That isn't a valid Solana wallet address.");
  const nonce = newNonce();
  const message = signInMessage({ domain, wallet, nonce, issuedAt: new Date() });
  const db = await getDb();
  await db.insert(nonces).values({ nonce, wallet, message, expiresAt: new Date(Date.now() + NONCE_TTL_MS) });
  return { nonce, message };
}

/** Completes a sign-in: checks the signature, burns the nonce, and sets the session cookie. */
export async function finishSignIn(wallet: string, nonce: string, signature: string): Promise<void> {
  if (!isWalletAddress(wallet) || typeof nonce !== "string" || typeof signature !== "string") {
    throw new AppError("bad-request", "Sign-in request is incomplete.");
  }
  const db = await getDb();
  // Claim the nonce atomically: unused, unexpired, for this wallet.
  const [claimed] = await db
    .update(nonces)
    .set({ usedAt: new Date() })
    .where(and(eq(nonces.nonce, nonce), eq(nonces.wallet, wallet), isNull(nonces.usedAt), gt(nonces.expiresAt, new Date())))
    .returning();
  if (!claimed) throw new AppError("not-signed-in", "That sign-in request expired. Please try again.");
  if (!verifyWalletSignature(claimed.message, signature, wallet)) {
    throw new AppError("not-signed-in", "The wallet signature didn't check out. Please try again.");
  }

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: hashToken(token), wallet, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in wallet, or null. */
export async function sessionWallet(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ wallet: sessions.wallet })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.wallet ?? null;
}

export async function requireSessionWallet(): Promise<string> {
  const wallet = await sessionWallet();
  if (!wallet) throw new AppError("not-signed-in", "Please sign in with your wallet first.");
  return wallet;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}
