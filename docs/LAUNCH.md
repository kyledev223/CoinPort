# Launching coins on CoinPort

Visitors connect their own wallet, fill in the Launch Coin form, approve one
transaction, and a real token is created on pump.fun (Solana **mainnet**). The
coin then appears in the hub as a truck. The site never holds keys or funds.

**Status:** built and tested locally against mainnet (see [What was verified](#what-was-verified)).
A real mainnet launch has **not** been run yet; do one small test launch after deploying.

---

## How a launch works

1. **Sign in.** The wallet signs a one-time message (no transaction, no cost). The server checks the ed25519 signature and sets an httpOnly session cookie, storing only a hash of it.
2. **Prepare** (`POST /api/launch/prepare`). The server validates the form, re-encodes the image (PNG, or WebP if animated, max 1000 px), uploads image + metadata to pump.fun's IPFS endpoint (Pinata as fallback), and stores a pending launch. Rate-limited per wallet and per IP.
3. **Mint key.** The browser generates the new token's mint keypair. Its secret key never leaves the browser.
4. **Build** (`POST /api/launch/build`). The server builds the transaction with `@pump-fun/pump-sdk` `createV2Instruction` (SOL quote, no mayhem mode, creator = the wallet), adds ComputeBudget unit limit + priority fee, sets the wallet as fee payer with a fresh blockhash, and **simulates** it. An empty wallet gets "Not enough SOL" here, before anything is signed.
5. **Sign.** The wallet signs first, then the browser adds the mint's signature.
6. **Relay** (`POST /api/launch/relay`). Before sending, the server checks: fee payer is the signed-in wallet; the only signers are the wallet and this launch's mint; the only instructions are ComputeBudget + exactly one pump create identical to the one it built (mint, name, symbol, URI); every signature is valid. Only then does it send.
7. **Finalize.** The server confirms the signature, checks the bonding curve exists and its creator is the wallet, and creates the coin row inside a database transaction that claims the launch first (safe if several pollers run at once). Runs on the launcher's status polls, on `/api/cron`, and on coin-feed requests (`after()`).
8. **The game** polls `GET /api/coins` every 4 s (`src/coins/apiCoinSource.ts`) and drives a truck in for each new coin. Market cap and curve progress refresh from the bonding curve in the background.

Fees: none taken by CoinPort. No dev buy. The creator pays rent + network fees (about 0.02 SOL).

---

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production, and Preview if you use it). **Changing a variable needs a redeploy.** For local development, put them in `.env.local` (never committed); `.env.example` lists them all with placeholders.

| Name | Required | What it's for | Example | Where to get it |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | Postgres for launches, coins, sessions, rate limits | `postgres://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require` | Set automatically by Vercel's Neon integration (Storage tab). Local: `pglite:./.data/pglite` runs an embedded database. |
| `SOLANA_RPC_URL` | **Yes** (strongly) | Mainnet RPC endpoints, comma-separated, best first. The public endpoint is always added last as a fallback | `https://mainnet.helius-rpc.com/?api-key=KEY` | Helius dashboard (see below) |
| `SITE_URL` | Recommended | Your site address, shown in the wallet sign-in message | `https://coinport.vercel.app` | Your Vercel domain |
| `CRON_SECRET` | **Yes** | Protects `/api/cron`; Vercel Cron sends it automatically | 64 hex characters | Generate (see 3.) |
| `PINATA_JWT` | Optional | Fallback upload if pump.fun's IPFS endpoint refuses Vercel | `eyJhbGciOi...` | Pinata → API Keys |
| `COINGECKO_API_KEY` | Optional | SOL/USD price; Coinbase and Kraken are used if CoinGecko fails | `CG-xxxx` | CoinGecko → Developer dashboard |
| `NEXT_PUBLIC_TOKEN_MINT` | Optional | Your own token's CA in the top bar (public) | base58 address | Your token |
| `NEXT_PUBLIC_TWITTER_URL` | Optional | Your X link in the top bar (public) | `https://x.com/yourhandle` | Your X profile |

Secrets (`DATABASE_URL`, `SOLANA_RPC_URL`, `CRON_SECRET`, `PINATA_JWT`, `COINGECKO_API_KEY`) are server-only: never prefix them with `NEXT_PUBLIC_`.

## 2. Accounts and API keys

- **Neon Postgres**: Vercel → your project → Storage → Create Database → Neon. Free plan is enough. Connect it to the project; Vercel adds `DATABASE_URL`. Pick region AWS us-east-1 (next to Vercel's default iad1 functions).
- **Helius** (RPC): https://dashboard.helius.dev, free plan to start. Copy **Endpoints → Mainnet RPC URL** (`https://mainnet.helius-rpc.com/?api-key=...`) into `SOLANA_RPC_URL`.
- **Pinata** (optional): https://app.pinata.cloud, free plan. API Keys → New Key (pinning) → copy the **JWT** into `PINATA_JWT`.
- **CoinGecko** (optional): https://www.coingecko.com/en/api, free Demo plan → copy the API key into `COINGECKO_API_KEY`.

## 3. Generated secrets

```bash
# CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit secrets. `.gitignore` excludes every `.env*` file except `.env.example`.

## 4. Host settings (Vercel)

- **Node.js version:** 22.x (Settings → General). `package.json` also sets `"engines": { "node": "22.x" }`.
- **Build command:** Vercel runs the `vercel-build` script automatically: `node scripts/migrate.mjs && next build`, which applies database migrations from `./drizzle` first. Without `DATABASE_URL` the migration step is skipped and launching stays off.
- **Cron:** `vercel.json` runs `/api/cron` daily at 04:00 UTC (Hobby allows once a day). Background work also runs on coin-feed requests and on launch status polls, so it doesn't depend on cron.
- **Database:** Neon Postgres, us-east-1.

## 5. After deploying

1. Open **`/api/health`**. Expect `"ok": true` and an empty `hints` list. Each check shows its timing; RPC endpoints are listed by hostname only.
2. Do a test launch from a wallet holding **about 0.03–0.05 SOL** (creating costs about 0.02 SOL in rent plus fees; the dialog shows the exact cost while the wallet asks).
3. Check the token on **pump.fun** (`https://pump.fun/coin/<mint>`) and that its truck drives into the hub within a few seconds.

## 6. Troubleshooting

Errors show a short code in brackets, e.g. `(insufficient-funds)`.

| Code | What it means | What to check |
|---|---|---|
| `not-configured` | No database configured | `DATABASE_URL`; redeploy; `/api/health` |
| `not-signed-in` | No session, or the sign-in signature/nonce failed | Connect again; cookies blocked? The nonce expires after 5 minutes |
| `invalid-form` | Form or image failed server checks | Name ≤ 32, symbol A–Z/0–9 ≤ 10, PNG/JPG/GIF/WebP ≤ 4 MB, https links |
| `rate-limited` | Too many prepares from this wallet or IP | Wait; limits are in `src/server/rateLimit.ts` |
| `upload-failed` | pump.fun's IPFS (and Pinata, if set) refused | Set `PINATA_JWT`; `/api/health` → `ipfs`, `pinata` |
| `rpc-rate-limited` | Every RPC endpoint rate-limited us | `SOLANA_RPC_URL` set to Helius? Plan limits |
| `rpc-unavailable` | RPC endpoints unreachable | Helius status; key valid? `/api/health` → `rpc` |
| `insufficient-funds` | The wallet can't pay rent + fees | Add SOL (≈ 0.03) |
| `simulation-failed` | The dry run failed for another reason | The message includes the program logs; pump program changes? Update `@pump-fun/pump-sdk` |
| `blockhash-expired` | The approval took too long; nothing was charged | The app rebuilds once automatically; approve again |
| `relay-rejected` | The signed transaction didn't match the launch | A wallet/extension altered it; try another wallet |
| `tx-rejected` | The network rejected the send | The message includes the logs |
| `internal` | Unexpected server error | Vercel → Logs |

A launch that's sent but not yet confirmed keeps finalizing in the background; if it can no longer land it's marked expired ("Nothing was charged").

## 7. Places to customise later

- **Your token and socials:** `NEXT_PUBLIC_TOKEN_MINT`, `NEXT_PUBLIC_TWITTER_URL` (top bar).
- **Rate limits:** `LIMITS` in `src/server/rateLimit.ts`.
- **Fees:** none today. A platform fee would be a SystemProgram transfer added in `src/server/launch/build.ts` and allowed explicitly in `src/server/launch/relayCheck.ts`.
- **Banned words / names:** add a check to `validateLaunchForm` in `src/shared/launchForm.ts` (runs in the browser and on the server).
- **Priority fee and compute bounds:** constants at the top of `src/server/launch/build.ts`.
- **Image size/type limits:** `src/shared/launchForm.ts` and `normalizeImage` in `src/server/launch/upload.ts`.
- **Wallets:** `src/wallet/WalletProviders.tsx` (Phantom, Solflare). OKX Wallet and other Wallet Standard wallets are detected automatically once installed; the picker's order and the "not installed" OKX entry are in `src/wallet/WalletDialogs.tsx`.

---

## What was verified

- Unit tests: the relay checker (wrong fee payer, extra instructions, extra signers, mismatched mint/name/symbol/URI, missing and forged signatures), RPC fail-over and error classification (no API keys in errors), curve maths, finalize against a real in-process Postgres (including five concurrent finalizers creating exactly one coin), sign-in signatures, rate limits, the job lock, the browser launch flow (wallet signs before the mint, expired approvals rebuilt once, declined requests explained) and the coin feed client.
- Production build, and `node --no-experimental-require-module -e "require('@pump-fun/pump-sdk')"` (strict Node load test).
- Against **mainnet**, locally: `/api/health` all green apart from the missing Helius key; building and simulating a real create for an empty wallet returns "Not enough SOL", not a generic error; sign-in round trip over HTTP.

Not yet verified: a real launch with a funded wallet; clicking through with a real wallet extension; a real upload to pump.fun's IPFS (only reachability was checked); behaviour on Vercel itself.
