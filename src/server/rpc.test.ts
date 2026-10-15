import type { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { classifyRpcError, withRpc } from "./rpc";

/** A fake endpoint that fails with the given errors in order, then answers with its hostname. */
function endpoints(behaviour: Record<string, Array<Error | "ok">>) {
  const calls: Record<string, number> = {};
  const connect = (url: string) => {
    const host = new URL(url).hostname;
    return {
      getSlot: async () => {
        const i = (calls[host] = (calls[host] ?? 0) + 1) - 1;
        const step = behaviour[host]?.[i] ?? "ok";
        if (step !== "ok") throw step;
        return host;
      },
    } as unknown as Connection;
  };
  return { calls, connect };
}

const URLS = ["https://helius.example/?api-key=SECRET123", "https://public.example"];
const run = (connect: (url: string) => Connection) => withRpc((c) => c.getSlot() as unknown as Promise<string>, { urls: URLS, connect, retryDelayMs: 0 });

describe("classifyRpcError", () => {
  it.each([
    ["429 Too Many Requests", "rate-limited"],
    ["403 Forbidden", "forbidden"],
    ["The operation was aborted due to timeout", "timeout"],
    ["fetch failed", "network"],
    ["Transaction simulation failed: Error processing Instruction 2", "other"],
  ])("%s → %s", (message, kind) => {
    expect(classifyRpcError(new Error(message))).toBe(kind);
  });
});

describe("withRpc", () => {
  it("retries once, then fails over to the next endpoint", async () => {
    const { calls, connect } = endpoints({ "helius.example": [new Error("429 Too Many Requests"), new Error("429 Too Many Requests")] });
    await expect(run(connect)).resolves.toBe("public.example");
    expect(calls).toEqual({ "helius.example": 2, "public.example": 1 });
  });

  it("recovers on the same endpoint after one timeout", async () => {
    const { calls, connect } = endpoints({ "helius.example": [new Error("request timed out")] });
    await expect(run(connect)).resolves.toBe("helius.example");
    expect(calls).toEqual({ "helius.example": 2 });
  });

  it("does not retry real errors", async () => {
    const real = new Error("Transaction simulation failed: insufficient lamports");
    const { calls, connect } = endpoints({ "helius.example": [real] });
    await expect(run(connect)).rejects.toBe(real);
    expect(calls).toEqual({ "helius.example": 1 });
  });

  it("reports rpc-rate-limited with hostnames only (never the API key)", async () => {
    const limited = () => new Error("429 Too Many Requests");
    const { connect } = endpoints({ "helius.example": [limited(), limited()], "public.example": [limited(), limited()] });
    const err = (await run(connect).catch((e) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("rpc-rate-limited");
    expect(err.detail).toContain("helius.example");
    expect(`${err.message} ${err.detail}`).not.toContain("SECRET123");
  });

  it("reports rpc-unavailable when endpoints are down", async () => {
    const down = () => new Error("fetch failed");
    const { connect } = endpoints({ "helius.example": [down(), down()], "public.example": [down(), down()] });
    const err = (await run(connect).catch((e) => e)) as AppError;
    expect(err.code).toBe("rpc-unavailable");
  });
});
