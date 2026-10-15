import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Layering guard. Game code (src/game) and the 3D scene (src/components/hub)
 * get coin data only through CoinSource and launch only through the onLaunch
 * prop: they must never import wallet, RPC, chain or server code directly.
 */

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

/** Packages and project folders that only the composition root / HUD / server may touch. */
const FORBIDDEN_PACKAGES = [/^@solana\//, /^@pump-fun\//, /^@coral-xyz\//, /rpc/i, /wallet/i];
const FORBIDDEN_DIRS = ["src/wallet", "src/server", "src/app/api"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const code = readFileSync(file, "utf8");
  const specs: string[] = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(pattern)) specs.push(m[1] ?? m[2]);
  return specs;
}

/** Project-relative path an import points at, or null for packages. */
function target(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return relative(ROOT, join(SRC, spec.slice(2))).replace(/\\/g, "/");
  if (spec.startsWith(".")) return relative(ROOT, resolve(dirname(file), spec)).replace(/\\/g, "/");
  return null;
}

function violations(scope: string, allow: (spec: string, path: string | null) => boolean) {
  const found: string[] = [];
  for (const file of sourceFiles(join(ROOT, scope))) {
    for (const spec of importsOf(file)) {
      if (!allow(spec, target(file, spec))) found.push(`${relative(ROOT, file)} → ${spec}`);
    }
  }
  return found;
}

const noWalletRpcOrServer = (spec: string, path: string | null) =>
  path ? !FORBIDDEN_DIRS.some((d) => path === d || path.startsWith(`${d}/`)) : !FORBIDDEN_PACKAGES.some((p) => p.test(spec));

describe("architecture", () => {
  it("keeps game code and the 3D scene free of wallet, RPC and server imports", () => {
    expect([...violations("src/game", noWalletRpcOrServer), ...violations("src/components/hub", noWalletRpcOrServer)]).toEqual([]);
  });

  it("keeps server code out of the browser: only API routes and src/server import it", () => {
    const found = [
      ...violations("src/components", (_spec, path) => !path?.startsWith("src/server")),
      ...violations("src/game", (_spec, path) => !path?.startsWith("src/server")),
      ...violations("src/store", (_spec, path) => !path?.startsWith("src/server")),
      ...violations("src/wallet", (_spec, path) => !path?.startsWith("src/server")),
      ...violations("src/launch", (_spec, path) => !path?.startsWith("src/server")),
      ...violations("src/coins", (_spec, path) => !path?.startsWith("src/server")),
    ];
    expect(found).toEqual([]);
  });

  it("keeps src/game self-contained (no React, store or UI)", () => {
    const found = violations("src/game", (spec, path) => (path ? path.startsWith("src/game") : false));
    expect(found).toEqual([]);
  });
});
