"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { CloseIcon } from "@/components/hud/icons";
import { useWalletUi } from "./walletUi";

const OKX = "OKX Wallet";

const INSTALL_URL: Record<string, string> = {
  Phantom: "https://phantom.com/download",
  Solflare: "https://solflare.com/download",
  [OKX]: "https://web3.okx.com/download",
};
/** Shown first, in this order; other detected wallets follow. */
const PREFERRED = ["Phantom", "Solflare", OKX];

/**
 * OKX Wallet has no adapter package: once installed it registers itself through
 * Wallet Standard and the adapter lists it. Until then the picker shows this
 * placeholder so people know it's supported and can get install steps.
 */
const OKX_PLACEHOLDER = {
  name: OKX as WalletName,
  icon:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#000"/>' +
        [[6, 6], [20, 6], [13, 13], [6, 20], [20, 20]].map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="6" fill="#fff"/>`).join("") +
        "</svg>",
    ),
  readyState: WalletReadyState.NotDetected,
};

/** The wallet picker and the "how to install" help, as one overlay. */
export function WalletDialogs() {
  const { pickerOpen, helpFor, close } = useWalletUi();
  if (!pickerOpen && !helpFor) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={close} aria-hidden="true" />
      {pickerOpen ? <Picker onClose={close} /> : <InstallHelp walletName={helpFor!} onClose={close} />}
    </div>
  );
}

function Frame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md rounded-t-2xl border border-amber-500/30 bg-panel shadow-2xl shadow-black sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-edge px-5 py-3.5">
        <h2 className="font-display text-base font-bold tracking-[0.14em] text-amber-400 uppercase">{title}</h2>
        <button type="button" onClick={onClose} className="rounded p-1.5 text-zinc-400 hover:bg-white/5" aria-label="Close">
          <CloseIcon className="text-lg" />
        </button>
      </header>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Picker({ onClose }: { onClose: () => void }) {
  const { wallets, select } = useWallet();
  const showHelp = useWalletUi((s) => s.showHelp);
  const entries = wallets.map(({ adapter, readyState }) => ({ name: adapter.name, icon: adapter.icon, readyState }));
  if (!entries.some((w) => w.name === OKX)) entries.push(OKX_PLACEHOLDER);
  const sorted = entries.sort((a, b) => {
    const ia = PREFERRED.indexOf(a.name);
    const ib = PREFERRED.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const choose = (name: WalletName, ready: WalletReadyState) => {
    // A wallet that isn't installed gets install steps, not a failed connect.
    if (ready === WalletReadyState.NotDetected || ready === WalletReadyState.Unsupported) {
      showHelp(name);
      return;
    }
    select(name); // autoConnect connects once it's selected
    onClose();
  };

  return (
    <Frame title="Connect a wallet" onClose={onClose}>
      <ul className="space-y-2">
        {sorted.map(({ name, icon, readyState }) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => choose(name, readyState)}
              className="flex w-full items-center gap-3 rounded-xl border border-edge bg-panel-raised/70 px-3.5 py-3 text-left transition hover:border-amber-400/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URLs from the adapter */}
              <img src={icon} alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
              <span className="flex-1 font-semibold text-zinc-100">{name}</span>
              <span className={`text-xs ${readyState === WalletReadyState.Installed ? "text-emerald-400" : "text-zinc-500"}`}>
                {readyState === WalletReadyState.Installed ? "Detected" : readyState === WalletReadyState.Loadable ? "Open" : "Not installed"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-zinc-500">CoinPort never asks for your seed phrase or private key. Launches are signed in your wallet.</p>
    </Frame>
  );
}

function InstallHelp({ walletName, onClose }: { walletName: string; onClose: () => void }) {
  const url = INSTALL_URL[walletName];
  const openPicker = useWalletUi((s) => s.openPicker);
  return (
    <Frame title={`Install ${walletName}`} onClose={onClose}>
      <p className="text-sm text-zinc-300">{walletName} isn&apos;t installed in this browser yet. To connect it:</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
        <li>
          On a computer, add the {walletName} extension to Chrome, Brave, Edge or Firefox
          {url ? (
            <>
              {" "}
              from{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-300 hover:text-amber-200">
                {new URL(url).host}
              </a>
            </>
          ) : null}
          .
        </li>
        <li>Create a new wallet or import one in the extension. Keep your recovery phrase offline and never share it with any site.</li>
        <li>Come back to this tab and refresh the page, then choose Connect wallet again.</li>
      </ol>
      <p className="mt-3 text-sm text-zinc-400">
        On a phone, open the {walletName} app and visit this site from its built-in browser.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={openPicker} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5">
          Back
        </button>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold tracking-wider text-black hover:bg-amber-300">
            GET {walletName.toUpperCase()}
          </a>
        )}
      </div>
    </Frame>
  );
}
