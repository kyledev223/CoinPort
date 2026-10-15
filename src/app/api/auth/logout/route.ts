import { signOut } from "@/server/auth/session";
import { respond } from "@/server/http";

export async function POST() {
  return respond(async () => {
    await signOut();
    return { ok: true };
  });
}
