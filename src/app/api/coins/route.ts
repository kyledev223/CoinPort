import { after, connection } from "next/server";
import { coinFeed } from "@/server/coinFeed";
import { databaseConfigured } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { respond } from "@/server/http";
import { tickSoon } from "@/server/tick";

/** GET → { coins, solUsd }: finalized coins with market data, newest first. Every game client polls this. */
export async function GET() {
  await connection();
  return respond(async () => {
    if (!databaseConfigured()) throw new AppError("not-configured", "The coin feed isn't set up yet: the site's database is not configured.");
    // Busy endpoint: also keeps background work (finalizing, market data) moving between cron runs.
    after(() => tickSoon());
    return coinFeed();
  });
}
