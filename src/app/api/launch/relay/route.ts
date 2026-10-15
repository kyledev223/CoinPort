import { requireSessionWallet } from "@/server/auth/session";
import { jsonBody, respond } from "@/server/http";
import { relayLaunch } from "@/server/launch/service";

export const maxDuration = 30;

/** POST { launchId, transaction (base64, signed by wallet and mint) } → { signature }. */
export async function POST(request: Request) {
  return respond(async () => {
    const wallet = await requireSessionWallet();
    const { launchId, transaction } = await jsonBody(request);
    return relayLaunch(wallet, launchId, transaction);
  });
}
