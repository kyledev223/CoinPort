import { startSignIn } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { clientIpHash, jsonBody, respond, siteDomain } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rateLimit";

/** POST { wallet } → { nonce, message }: the message the wallet signs to sign in. */
export async function POST(request: Request) {
  return respond(async () => {
    const { wallet } = await jsonBody(request);
    await rateLimit(await getDb(), `signin:ip:${clientIpHash(request)}`, LIMITS.signInIp);
    return startSignIn(String(wallet ?? ""), siteDomain(request));
  });
}
