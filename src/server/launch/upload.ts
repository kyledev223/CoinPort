import "server-only";
import { AppError } from "../errors";
import { env } from "../env";

/**
 * Image normalising and metadata upload.
 * Upload goes to pump.fun's own IPFS endpoint; if that fails and PINATA_JWT is
 * set, Pinata is the fallback. The metadata URI is used exactly as returned.
 */

export interface NormalizedImage {
  bytes: Buffer;
  type: "image/png" | "image/webp";
  ext: "png" | "webp";
}

const MAX_SIDE = 1000;

/** Re-encode to PNG (or WebP if animated), auto-rotated and at most 1000 px a side. Rejects files that aren't real images. */
export async function normalizeImage(file: File): Promise<NormalizedImage> {
  const sharp = (await import("sharp")).default;
  const input = Buffer.from(await file.arrayBuffer());
  let animated = false;
  try {
    const meta = await sharp(input, { animated: true }).metadata();
    animated = (meta.pages ?? 1) > 1;
  } catch {
    throw new AppError("invalid-form", "That image file couldn't be read. Try a different PNG, JPG, GIF or WebP.");
  }
  const pipeline = sharp(input, { animated }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
  return animated
    ? { bytes: await pipeline.webp({ quality: 90 }).toBuffer(), type: "image/webp", ext: "webp" }
    : { bytes: await pipeline.png({ compressionLevel: 9 }).toBuffer(), type: "image/png", ext: "png" };
}

export interface MetadataInput {
  image: NormalizedImage;
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface UploadedMetadata {
  metadataUri: string;
  imageUrl: string | null;
  provider: "pump.fun" | "pinata";
}

export const PUMP_IPFS_URL = "https://pump.fun/api/ipfs";

async function uploadToPump(input: MetadataInput): Promise<UploadedMetadata> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.image.bytes)], { type: input.image.type }), `image.${input.image.ext}`);
  form.append("name", input.name);
  form.append("symbol", input.symbol);
  form.append("description", input.description);
  if (input.twitter) form.append("twitter", input.twitter);
  if (input.telegram) form.append("telegram", input.telegram);
  if (input.website) form.append("website", input.website);
  form.append("showName", "true");
  const res = await fetch(PUMP_IPFS_URL, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`pump.fun upload answered ${res.status}`);
  const json = (await res.json()) as { metadataUri?: unknown; metadata?: { image?: unknown } };
  if (typeof json.metadataUri !== "string" || !json.metadataUri) throw new Error("pump.fun upload returned no metadataUri");
  return {
    metadataUri: json.metadataUri,
    imageUrl: typeof json.metadata?.image === "string" ? json.metadata.image : null,
    provider: "pump.fun",
  };
}

async function uploadToPinata(input: MetadataInput, jwt: string): Promise<UploadedMetadata> {
  const auth = { Authorization: `Bearer ${jwt}` };
  const fileForm = new FormData();
  fileForm.append("file", new Blob([new Uint8Array(input.image.bytes)], { type: input.image.type }), `image.${input.image.ext}`);
  const fileRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: auth, body: fileForm, signal: AbortSignal.timeout(30_000) });
  if (!fileRes.ok) throw new Error(`Pinata image upload answered ${fileRes.status}`);
  const { IpfsHash: imageCid } = (await fileRes.json()) as { IpfsHash: string };
  const imageUrl = `https://ipfs.io/ipfs/${imageCid}`;

  const metadata = {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: imageUrl,
    showName: true,
    createdOn: "https://pump.fun",
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.telegram ? { telegram: input.telegram } : {}),
    ...(input.website ? { website: input.website } : {}),
  };
  const jsonRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `${input.symbol}-metadata.json` } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!jsonRes.ok) throw new Error(`Pinata metadata upload answered ${jsonRes.status}`);
  const { IpfsHash: metaCid } = (await jsonRes.json()) as { IpfsHash: string };
  return { metadataUri: `https://ipfs.io/ipfs/${metaCid}`, imageUrl, provider: "pinata" };
}

export async function uploadMetadata(input: MetadataInput): Promise<UploadedMetadata> {
  try {
    return await uploadToPump(input);
  } catch (pumpErr) {
    const jwt = env.pinataJwt;
    console.warn("[coinport] pump.fun metadata upload failed:", pumpErr instanceof Error ? pumpErr.message : pumpErr);
    if (!jwt) throw new AppError("upload-failed", "We couldn't upload your coin's image and details. Please try again in a minute.");
    try {
      return await uploadToPinata(input, jwt);
    } catch (pinataErr) {
      console.warn("[coinport] Pinata metadata upload failed:", pinataErr instanceof Error ? pinataErr.message : pinataErr);
      throw new AppError("upload-failed", "We couldn't upload your coin's image and details. Please try again in a minute.");
    }
  }
}
