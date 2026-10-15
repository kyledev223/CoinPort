/** Browser-side calls to the CoinPort API. Errors carry the server's short code. */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, body?: Record<string, unknown> | FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", "Couldn't reach CoinPort. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as { error?: { code: string; message: string; detail?: string } } | null;
  if (!res.ok || json?.error) {
    const e = json?.error;
    throw new ApiError(e?.code ?? `http-${res.status}`, e?.message ?? `Request failed (${res.status}).`, e?.detail);
  }
  return json as T;
}

export const bytesToBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
