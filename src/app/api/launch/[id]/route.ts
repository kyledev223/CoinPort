import { after, connection } from "next/server";
import { requireSessionWallet } from "@/server/auth/session";
import { respond } from "@/server/http";
import { launchStatus } from "@/server/launch/service";
import { tickSoon } from "@/server/tick";

/** GET → the launch's status. Finalizes it on the way, so a launch completes while its creator watches. */
export async function GET(_request: Request, ctx: RouteContext<"/api/launch/[id]">) {
  await connection();
  return respond(async () => {
    const wallet = await requireSessionWallet();
    const { id } = await ctx.params;
    after(() => tickSoon());
    return launchStatus(wallet, id);
  });
}
