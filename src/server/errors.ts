/**
 * Errors the player can see. Every one has a short code (listed in
 * docs/LAUNCH.md under Troubleshooting) and a plain-English message.
 */

export type ErrorCode =
  | "not-configured"
  | "bad-request"
  | "invalid-form"
  | "not-signed-in"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "upload-failed"
  | "rpc-rate-limited"
  | "rpc-unavailable"
  | "insufficient-funds"
  | "simulation-failed"
  | "blockhash-expired"
  | "tx-rejected"
  | "relay-rejected"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  "not-configured": 503,
  "bad-request": 400,
  "invalid-form": 400,
  "not-signed-in": 401,
  forbidden: 403,
  "not-found": 404,
  "rate-limited": 429,
  "upload-failed": 502,
  "rpc-rate-limited": 503,
  "rpc-unavailable": 503,
  "insufficient-funds": 400,
  "simulation-failed": 400,
  "blockhash-expired": 409,
  "tx-rejected": 400,
  "relay-rejected": 400,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Extra detail for the player (e.g. program logs), never secrets. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    return STATUS[this.code];
  }
}

/** JSON body for an error response. Unknown errors are hidden behind "internal". */
export function errorBody(err: unknown): { status: number; body: { error: { code: ErrorCode; message: string; detail?: string } } } {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, ...(err.detail ? { detail: err.detail } : {}) } } };
  }
  console.error("[coinport] unexpected error", err);
  return { status: 500, body: { error: { code: "internal", message: "Something went wrong on our side. Please try again." } } };
}
