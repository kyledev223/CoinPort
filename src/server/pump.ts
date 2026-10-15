import "server-only";
import { createRequire } from "node:module";

/**
 * The pump SDK, loaded through CommonJS. Its ESM build fails to load in Node
 * (an `@coral-xyz/anchor` "BN" export error), so every server module gets it
 * from here. It's listed in next.config's serverExternalPackages, so Node's
 * own `require` resolves it at runtime.
 */
type PumpSdkModule = typeof import("@pump-fun/pump-sdk");

const require = createRequire(import.meta.url);
let loaded: PumpSdkModule | null = null;

export function pumpSdk(): PumpSdkModule {
  loaded ??= require("@pump-fun/pump-sdk") as PumpSdkModule;
  return loaded;
}
