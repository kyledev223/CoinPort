/**
 * The connected wallet's address, or null when none is connected.
 *
 * TODO(wallet): there is no wallet integration yet, so this always returns
 * null and "My coins" stays disabled. Replace the body with the wallet
 * adapter's public key, e.g. `useWallet().publicKey?.toBase58() ?? null`.
 */
export function useConnectedWallet(): string | null {
  return null;
}
