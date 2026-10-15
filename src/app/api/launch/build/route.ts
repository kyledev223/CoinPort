import { requireSessionWallet } from "@/server/auth/session";
import { jsonBody, respond } from "@/server/http";
import { buildLaunch } from "@/server/launch/service";

export const maxDuration = 30;

/** POST { launchId, mint } → { transaction (base64, unsigned), lastValidBlockHeight, costLamports }. */
export async function POST(request: Request) {
  return respond(async () => {
    const wallet = await requireSessionWallet();
    const { launchId, mint } = await jsonBody(request);
    return buildLaunch(wallet, launchId, mint);
  });
}
