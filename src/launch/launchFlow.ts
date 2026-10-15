import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { LaunchFormData } from "@/shared/launchForm";
import type { LaunchProgress, LaunchResult } from "@/components/launch/LaunchCoinDialog";
import { ApiError, api, base64ToBytes, bytesToBase64 } from "./api";

/**
 * The real launch, non-custodial: the site never holds keys or funds.
 *   sign in → prepare (server uploads metadata) → mint keypair made here →
 *   build (server) → wallet signs, then the mint signs → relay (server checks + sends) →
 *   poll status until the server has finalized the coin.
 */

/** The bits of the wallet adapter the flow needs. */
export interface LaunchWallet {
  publicKey: { toBase58(): string } | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: <T extends VersionedTransaction>(tx: T) => Promise<T>;
}

const POLL_MS = 2_000;
const POLL_LIMIT_MS = 120_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Signs in with a wallet signature if this browser doesn't already have a session for this wallet. */
export async function ensureSignedIn(wallet: LaunchWallet): Promise<void> {
  const address = wallet.publicKey?.toBase58();
  if (!address) throw new Error("Connect your wallet to launch.");
  const me = await api<{ wallet: string | null }>("/api/auth/me");
  if (me.wallet === address) return;
  if (!wallet.signMessage) throw new Error("This wallet can't sign messages, so it can't sign in. Try Phantom or Solflare.");
  const { nonce, message } = await api<{ nonce: string; message: string }>("/api/auth/nonce", { wallet: address });
  const signature = await wallet.signMessage(new TextEncoder().encode(message));
  await api("/api/auth/verify", { wallet: address, nonce, signature: bs58.encode(signature) });
}

/** Turns wallet-adapter errors into messages a player understands. */
export function friendlyWalletError(err: unknown): Error {
  if (err instanceof ApiError) return new Error(`${err.message} (${err.code})`);
  const e = err as { name?: string; message?: string };
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (/reject|declin|denied|cancel/i.test(text)) return new Error("You declined in your wallet. Nothing was sent and no SOL was spent.");
  if (/WalletNotConnected|not connected/i.test(text)) return new Error("Your wallet disconnected. Connect it and try again.");
  return err instanceof Error ? err : new Error(String(err));
}

function formFor(data: LaunchFormData): FormData {
  const form = new FormData();
  form.append("image", data.image);
  form.append("name", data.name);
  form.append("symbol", data.symbol);
  form.append("description", data.description);
  if (data.twitter) form.append("twitter", data.twitter);
  if (data.telegram) form.append("telegram", data.telegram);
  if (data.website) form.append("website", data.website);
  return form;
}

/** Builds the dialog's onLaunch, reading the live wallet each time it runs. */
export function createLaunchHandler(getWallet: () => LaunchWallet) {
  return async (data: LaunchFormData, progress: LaunchProgress): Promise<LaunchResult> => {
    const wallet = getWallet();
    try {
      if (!wallet.publicKey || !wallet.signTransaction) throw new Error("Connect your wallet to launch.");
      await ensureSignedIn(wallet);

      const { launchId } = await api<{ launchId: string }>("/api/launch/prepare", formFor(data));

      // If an approval expires before it lands, rebuild once and ask again: nothing was charged.
      for (let attempt = 0; ; attempt++) {
        const mint = Keypair.generate(); // made here; its secret key never leaves the browser
        const built = await api<{ transaction: string; costLamports: number }>("/api/launch/build", { launchId, mint: mint.publicKey.toBase58() });
        progress.quoted?.(built.costLamports);

        const tx = VersionedTransaction.deserialize(base64ToBytes(built.transaction));
        const signed = await wallet.signTransaction(tx); // the wallet signs first…
        signed.sign([mint]); // …then the mint (some wallets drop a signature added before theirs)
        progress.approved();

        try {
          await api("/api/launch/relay", { launchId, transaction: bytesToBase64(signed.serialize()) });
          break;
        } catch (err) {
          if (err instanceof ApiError && err.code === "blockhash-expired" && attempt === 0) continue;
          throw err;
        }
      }

      const deadline = Date.now() + POLL_LIMIT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const status = await api<{ status: string; mint: string | null; error: string | null }>(`/api/launch/${launchId}`);
        if (status.status === "confirmed" && status.mint) return { mint: status.mint };
        if (status.status === "failed" || status.status === "expired") throw new Error(status.error ?? `Launch ${status.status}.`);
      }
      throw new Error("Your launch was sent but is still confirming. It will appear in the hub once the network confirms it.");
    } catch (err) {
      throw friendlyWalletError(err);
    }
  };
}
