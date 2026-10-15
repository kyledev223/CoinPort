import { requireSessionWallet } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { clientIpHash, respond } from "@/server/http";
import { prepareLaunch } from "@/server/launch/service";

// Image processing and the metadata upload can take a while.
export const maxDuration = 60;

/** POST multipart form (image, name, symbol, description, twitter, telegram, website) → { launchId, metadataUri }. */
export async function POST(request: Request) {
  return respond(async () => {
    const wallet = await requireSessionWallet();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("bad-request", "The launch form couldn't be read.");
    }
    return prepareLaunch(wallet, clientIpHash(request), form);
  });
}
