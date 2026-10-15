import { connection } from "next/server";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { respond } from "@/server/http";
import { runTick } from "@/server/tick";

export const maxDuration = 60;

/** GET with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this) or `?secret=<CRON_SECRET>`. */
export async function GET(request: Request) {
  await connection();
  return respond(async () => {
    const secret = env.cronSecret;
    const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(request.url).searchParams.get("secret");
    if (!secret) throw new AppError("not-configured", "CRON_SECRET is not set.");
    if (given !== secret) throw new AppError("forbidden", "Not allowed.");
    return runTick();
  });
}
