"use client";

import { useState } from "react";
import { PROJECT, projectPumpFunUrl } from "@/config";
import { shortAddress } from "@/game";
import { CheckIcon } from "./icons";

/** X (Twitter) logo glyph. */
function XLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Generic pill mark for the pump.fun button. */
function PillIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className={className}>
      <g transform="rotate(-45 12 12)">
        <rect x="3" y="8" width="18" height="8" rx="4" fill="#ffffff" />
        <path d="M12 8h5a4 4 0 0 1 0 8h-5z" fill="#4ade80" />
        <rect x="3" y="8" width="18" height="8" rx="4" fill="none" stroke="#0b0f15" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

const button =
  "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-display text-xs font-bold tracking-wider transition";
const enabled = "border-edge bg-panel-raised/80 text-zinc-100 hover:border-amber-400/60 hover:text-amber-300";
const disabled = "cursor-not-allowed border-edge/60 text-zinc-500";

/**
 * CoinPort's own token: X link, contract address with copy, and pump.fun link.
 * Values come from PROJECT in src/config.ts; unset ones show as coming soon.
 */
export function ProjectLinks({ className = "" }: { className?: string }) {
  const { tokenMint, twitterUrl } = PROJECT;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!tokenMint) return;
    navigator.clipboard?.writeText(tokenMint).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className={`items-center gap-1.5 sm:gap-2 ${className}`}>
      {twitterUrl ? (
        <a href={twitterUrl} target="_blank" rel="noopener noreferrer" aria-label="CoinPort on X" title="CoinPort on X" className={`${button} ${enabled} w-10 justify-center px-0`}>
          <XLogo className="text-base" />
        </a>
      ) : (
        <span aria-disabled="true" title="X account coming soon" className={`${button} ${disabled} w-10 justify-center px-0`}>
          <XLogo className="text-base" />
        </span>
      )}

      <div className={`${button} min-w-0 border-edge bg-panel-raised/80 pr-1`}>
        <span className="text-amber-400">CA</span>
        {tokenMint ? (
          <>
            <span className="min-w-0 truncate font-mono text-[12px] font-medium tracking-normal text-zinc-100" title={tokenMint}>
              {shortAddress(tokenMint, 5)}
            </span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy contract address"
              className="ml-0.5 flex h-7 items-center gap-1 rounded-md bg-amber-400 px-2 text-[11px] font-bold text-black hover:bg-amber-300"
            >
              {copied ? (
                <>
                  <CheckIcon /> COPIED
                </>
              ) : (
                "COPY"
              )}
            </button>
          </>
        ) : (
          <span className="pr-1.5 font-sans text-[12px] font-medium tracking-normal text-zinc-500">Coming soon</span>
        )}
      </div>

      {tokenMint ? (
        <a href={projectPumpFunUrl(tokenMint)} target="_blank" rel="noopener noreferrer" title="Buy on pump.fun" className={`${button} ${enabled}`}>
          <PillIcon className="text-lg" />
          <span>pump.fun</span>
        </a>
      ) : (
        <span aria-disabled="true" title="pump.fun page coming soon" className={`${button} ${disabled}`}>
          <PillIcon className="text-lg opacity-50" />
          <span>pump.fun</span>
        </span>
      )}
    </div>
  );
}
