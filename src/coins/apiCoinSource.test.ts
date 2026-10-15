import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCoinSource } from "./apiCoinSource";

const coin = (mint: string, updatedAt: number, marketCapSol = 30) => ({
  mint,
  name: mint,
  symbol: mint.toUpperCase(),
  imageUrl: "",
  metadataUri: "",
  creatorWallet: "W",
  createdAt: 1,
  marketCapSol,
  curveProgress: 0.1,
  graduated: false,
  updatedAt,
});

function feed(pages: unknown[]) {
  let i = 0;
  return vi.fn(async () => {
    const page = pages[Math.min(i++, pages.length - 1)];
    return page instanceof Response ? page : new Response(JSON.stringify(page), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("ApiCoinSource", () => {
  afterEach(() => vi.useRealTimers());

  it("lists the feed and then pushes only new or changed coins", async () => {
    vi.useFakeTimers();
    const fetchImpl = feed([{ coins: [coin("a", 1), coin("b", 1)] }, { coins: [coin("a", 1), coin("b", 2, 55), coin("c", 1)] }]);
    const source = new ApiCoinSource("/api/coins", 1000, fetchImpl);
    const first = await source.listCoins();
    expect(first.map((c) => c.mint)).toEqual(["a", "b"]);
    expect(first[0]).not.toHaveProperty("updatedAt");

    const pushed: string[][] = [];
    const stop = source.subscribe((changed) => pushed.push(changed.map((c) => c.mint)));
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(pushed).toEqual([["b", "c"]]);
  });

  it("fails the first load clearly when the feed isn't available", async () => {
    const fetchImpl = feed([new Response(JSON.stringify({ error: { code: "not-configured", message: "The coin feed isn't set up yet." } }), { status: 503 })]);
    await expect(new ApiCoinSource("/api/coins", 1000, fetchImpl).listCoins()).rejects.toThrow(/isn't set up/);
  });
});
