import { describe, expect, it } from "vitest";
import { RefCache } from "./refCache";

class Res {
  disposed = 0;
  dispose() {
    this.disposed++;
  }
}

describe("RefCache", () => {
  it("shares one value per key and disposes it after the last release", () => {
    const cache = new RefCache<Res>();
    let created = 0;
    const make = () => (created++, new Res());
    const a = cache.acquire("mint-1", make);
    const b = cache.acquire("mint-1", make);
    expect(a).toBe(b);
    expect(created).toBe(1);

    cache.release("mint-1");
    expect(a.disposed).toBe(0);
    cache.release("mint-1");
    expect(a.disposed).toBe(1);
    expect(cache.has("mint-1")).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("recreates after disposal and ignores stray releases", () => {
    const cache = new RefCache<Res>();
    const first = cache.acquire("k", () => new Res());
    cache.release("k");
    cache.release("k");
    const second = cache.acquire("k", () => new Res());
    expect(second).not.toBe(first);
    expect(first.disposed).toBe(1);
  });
});
