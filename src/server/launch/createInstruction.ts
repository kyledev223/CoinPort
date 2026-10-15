import "server-only";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { pumpSdk } from "../pump";

/**
 * The pump create instruction for a launch, built with the official SDK's
 * `createV2Instruction`: SOL quote, no mayhem mode, not a holder-reward coin,
 * so the bonding curve's creator is the launching wallet. The relay rebuilds
 * this to check the signed transaction against it.
 */
export function createInstructionFor(launch: { wallet: string; mint: string; name: string; symbol: string; metadataUri: string }): Promise<TransactionInstruction> {
  const creator = new PublicKey(launch.wallet);
  return pumpSdk().PUMP_SDK.createV2Instruction({
    mint: new PublicKey(launch.mint),
    name: launch.name,
    symbol: launch.symbol,
    uri: launch.metadataUri,
    creator,
    user: creator,
    mayhemMode: false,
  });
}
