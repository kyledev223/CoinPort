import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../../../test/db";
import type { Db } from "../db/client";
import { coins, launches } from "../db/schema";
import { finalizeLaunch, type ChainReader } from "./finalize";

const WALLET = "4Nd1mYw5cUQ6VZQ4ySfMxZWn3PeCTfQ1N1yAzZ7nW8vA";
const MINT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

const stats = { marketCapSol: 31.5, curveProgress: 0.04, complete: false };

function chain(over: Partial<ChainReader> = {}): ChainReader {
  return {
    signatureStatus: async () => ({ confirmed: true, err: null }),
    blockHeight: async () => 1_000,
    bondingCurve: async () => ({ creator: WALLET, stats, graduated: false }),
    ...over,
  };
}

async function sentLaunch(db: Db, over: Partial<typeof launches.$inferInsert> = {}) {
  const [row] = await db
    .insert(launches)
    .values({ wallet: WALLET, ipHash: "ip", name: "Frog Fuel", symbol: "FROG", metadataUri: "https://ipfs.io/ipfs/Qm", mint: MINT, signature: "sig1", status: "sent", lastValidBlockHeight: 2_000, ...over })
    .returning();
  return row;
}

describe("finalizeLaunch", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("creates the coin once the transaction confirms and the curve's creator is the wallet", async () => {
    const launch = await sentLaunch(db);
    const done = await finalizeLaunch(db, launch.id, chain());
    expect(done?.status).toBe("confirmed");
    const rows = await db.select().from(coins);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mint: MINT, symbol: "FROG", creator: WALLET, marketCapSol: 31.5, curveProgress: 0.04 });
  });

  it("is safe to run concurrently: exactly one coin, one confirmed launch", async () => {
    const launch = await sentLaunch(db);
    const results = await Promise.all(Array.from({ length: 5 }, () => finalizeLaunch(db, launch.id, chain())));
    expect(results.every((r) => r?.status === "confirmed")).toBe(true);
    expect(await db.select().from(coins)).toHaveLength(1);
  });

  it("is idempotent once confirmed", async () => {
    const launch = await sentLaunch(db);
    await finalizeLaunch(db, launch.id, chain());
    let curveReads = 0;
    const again = await finalizeLaunch(db, launch.id, chain({ bondingCurve: async () => (curveReads++, null) }));
    expect(again?.status).toBe("confirmed");
    expect(curveReads).toBe(0);
  });

  it("waits while the transaction isn't visible, then expires once its blockhash can't land", async () => {
    const launch = await sentLaunch(db);
    expect((await finalizeLaunch(db, launch.id, chain({ signatureStatus: async () => null, blockHeight: async () => 1_500 })))?.status).toBe("sent");
    const expired = await finalizeLaunch(db, launch.id, chain({ signatureStatus: async () => null, blockHeight: async () => 2_001 }));
    expect(expired?.status).toBe("expired");
    expect(expired?.error).toMatch(/Nothing was charged/);
  });

  it("marks on-chain failures with a reason", async () => {
    const launch = await sentLaunch(db);
    const failed = await finalizeLaunch(db, launch.id, chain({ signatureStatus: async () => ({ confirmed: true, err: { InstructionError: [2, { Custom: 6000 }] } }) }));
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toMatch(/Custom/);
    expect(await db.select().from(coins)).toHaveLength(0);
  });

  it("refuses a curve created by someone else", async () => {
    const launch = await sentLaunch(db);
    const failed = await finalizeLaunch(db, launch.id, chain({ bondingCurve: async () => ({ creator: "SomeoneElse111111111111111111111111111111111", stats, graduated: false }) }));
    expect(failed?.status).toBe("failed");
    expect(await db.select().from(coins)).toHaveLength(0);
  });

  it("keeps waiting when confirmed but the curve isn't visible yet", async () => {
    const launch = await sentLaunch(db);
    const pending = await finalizeLaunch(db, launch.id, chain({ bondingCurve: async () => null }));
    expect(pending?.status).toBe("sent");
    const [row] = await db.select().from(launches).where(eq(launches.id, launch.id));
    expect(row.status).toBe("sent");
  });
});
