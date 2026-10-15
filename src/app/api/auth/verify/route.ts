import { finishSignIn } from "@/server/auth/session";
import { jsonBody, respond } from "@/server/http";

/** POST { wallet, nonce, signature } → sets the session cookie. */
export async function POST(request: Request) {
  return respond(async () => {
    const { wallet, nonce, signature } = await jsonBody(request);
    await finishSignIn(wallet as string, nonce as string, signature as string);
    return { wallet };
  });
}
