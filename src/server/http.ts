import "server-only";
import { NextResponse } from "next/server";
import { AppError, errorBody } from "./errors";
import { env } from "./env";
import { hashIp } from "./auth/signIn";

/** Wraps a route handler: AppErrors become JSON with their code; anything else becomes "internal". */
export async function respond<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = errorBody(err);
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new AppError("bad-request", "The request body must be JSON.");
}

/** Hashed client IP (Vercel sets x-forwarded-for). */
export function clientIpHash(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return hashIp(forwarded || request.headers.get("x-real-ip") || "unknown");
}

/** The domain named in the sign-in message: SITE_URL's host, else the request's host. */
export function siteDomain(request: Request): string {
  const site = env.siteUrl;
  if (site) {
    try {
      return new URL(site).host;
    } catch {
      // fall through
    }
  }
  return request.headers.get("host") ?? "coinport";
}
