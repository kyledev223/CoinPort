import { connection } from "next/server";
import { sessionWallet } from "@/server/auth/session";
import { databaseConfigured } from "@/server/db/client";
import { respond } from "@/server/http";

/** GET → { wallet }: the signed-in wallet, or null. */
export async function GET() {
  await connection();
  return respond(async () => ({ wallet: databaseConfigured() ? await sessionWallet() : null }));
}
