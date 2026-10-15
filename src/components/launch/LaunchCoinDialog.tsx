"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { truckIdForMint } from "@/game";
import { useGameStore } from "@/store/gameStore";
import { useConnectedWallet } from "@/wallet/useConnectedWallet";
import { useWalletUi } from "@/wallet/walletUi";
import { CheckIcon, CloseIcon, ImageIcon, RocketIcon, WalletIcon } from "../hud/icons";
import {
  DESCRIPTION_MAX,
  EMPTY_LAUNCH_FORM,
  IMAGE_TYPES,
  NAME_MAX,
  SYMBOL_MAX,
  normalizeSymbol,
  toLaunchFormData,
  validateLaunchForm,
  type LaunchFormData,
  type LaunchFormValues,
} from "@/shared/launchForm";

export type LaunchStep = "details" | "approve" | "launching" | "arrived";

/** Lets the launch flow move the step indicator along. */
export interface LaunchProgress {
  /** The wallet signed; the indicator moves from "Approve in wallet" to "Launching". */
  approved(): void;
  /** What the launch will cost (lamports, from the server's simulation), shown while the wallet asks. */
  quoted?(costLamports: number): void;
}

export interface LaunchResult {
  /** Mint of the new coin; its truck is focused once it reaches the hub. */
  mint: string;
}

/**
 * The one hook point for launching. It receives the validated form; it should
 * call `progress.approved()` after the wallet signs and resolve with the new
 * mint (or reject with an Error to show the user).
 */
export type OnLaunch = (data: LaunchFormData, progress: LaunchProgress) => Promise<LaunchResult>;

const STEPS: Array<{ id: LaunchStep; label: string }> = [
  { id: "details", label: "Details" },
  { id: "approve", label: "Approve in wallet" },
  { id: "launching", label: "Launching" },
  { id: "arrived", label: "Arrived" },
];

const LINK_FIELDS = [
  { key: "twitter", label: "Twitter / X", placeholder: "https://x.com/yourcoin" },
  { key: "telegram", label: "Telegram", placeholder: "https://t.me/yourcoin" },
  { key: "website", label: "Website", placeholder: "https://yourcoin.fun" },
] as const;

export function LaunchCoinDialog({ open, onClose, onLaunch }: { open: boolean; onClose: () => void; onLaunch: OnLaunch }) {
  if (!open) return null;
  // Remount per opening so every launch starts from a clean form.
  return <LaunchCoinDialogBody onClose={onClose} onLaunch={onLaunch} />;
}

function LaunchCoinDialogBody({ onClose, onLaunch }: { onClose: () => void; onLaunch: OnLaunch }) {
  const titleId = useId();
  const [values, setValues] = useState<LaunchFormValues>(EMPTY_LAUNCH_FORM);
  const [preview, setPreview] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof LaunchFormValues, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<Exclude<LaunchStep, "arrived">>("details");
  const [mint, setMint] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [costSol, setCostSol] = useState<number | null>(null);
  const wallet = useConnectedWallet();
  const openWalletPicker = useWalletUi((s) => s.openPicker);
  const focusMint = useGameStore((s) => s.focusMint);
  const truckArrived = useGameStore((s) => (mint ? Boolean(s.truckIndex[truckIdForMint(mint)]) : false));
  const previewRef = useRef<string | null>(null);

  const current: LaunchStep = mint && truckArrived ? "arrived" : step;
  const busy = current === "approve" || current === "launching";
  const errors = validateLaunchForm(values);
  const show = (field: keyof LaunchFormValues) => (submitted || touched[field] ? errors[field] : undefined);

  // Free the preview's object URL when the dialog goes away.
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  // Escape closes, except mid-launch when the wallet may still be prompting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const set = <K extends keyof LaunchFormValues>(key: K, value: LaunchFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const blur = (key: keyof LaunchFormValues) => setTouched((t) => ({ ...t, [key]: true }));

  const pickImage = (file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewRef.current);
    set("image", file);
    blur("image");
  };

  const submit = async () => {
    setSubmitted(true);
    setFailure(null);
    const data = toLaunchFormData(values);
    if (!data) return;
    if (!wallet) {
      openWalletPicker();
      return;
    }
    setStep("approve");
    setCostSol(null);
    try {
      // The real launch (sign-in, upload, build, wallet + mint signatures, relay, finalize): see src/launch/launchFlow.ts.
      const result = await onLaunch(data, {
        approved: () => setStep("launching"),
        quoted: (lamports) => setCostSol(lamports / 1e9),
      });
      setStep("launching");
      setMint(result.mint);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Launch failed. Nothing was sent.");
      setStep("details");
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-amber-500/30 bg-panel shadow-2xl shadow-black sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.14em] text-amber-400 uppercase">
            <RocketIcon /> Launch coin
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1.5 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
            aria-label="Close"
          >
            <CloseIcon className="text-lg" />
          </button>
        </header>

        <StepIndicator current={current} />
        {current === "details" && (
          <p className="border-b border-edge bg-sky-400/5 px-5 py-2.5 text-xs text-sky-200/90">
            <span className="font-bold text-sky-300">Solana mainnet.</span> This creates a real token on pump.fun. Your wallet pays the rent
            and network fees (about 0.02–0.03 SOL) and you approve the transaction yourself. CoinPort never asks for your recovery phrase.
          </p>
        )}

        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {current === "details" && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-4"
              id="launch-form"
            >
              {failure && (
                <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {failure}
                </p>
              )}

              <Field label="Image" error={show("image")} required>
                {(id, describedBy) => (
                  <label
                    htmlFor={id}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border border-dashed p-3 transition hover:border-amber-400/60 ${
                      show("image") ? "border-red-500/60" : "border-white/15"
                    }`}
                  >
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview
                      <img src={preview} alt="Coin image preview" className="h-20 w-20 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/5 text-3xl text-zinc-500">
                        <ImageIcon />
                      </span>
                    )}
                    <span className="text-sm text-zinc-300">
                      {values.image ? values.image.name : "Choose an image"}
                      <span className="block text-xs text-zinc-500">PNG, JPG, GIF or WebP, up to 4 MB</span>
                    </span>
                    <input
                      id={id}
                      type="file"
                      accept={IMAGE_TYPES.join(",")}
                      className="sr-only"
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(show("image"))}
                      onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <Field label="Name" error={show("name")} required counter={`${values.name.length}/${NAME_MAX}`}>
                  {(id, describedBy) => (
                    <input
                      id={id}
                      autoFocus
                      value={values.name}
                      maxLength={NAME_MAX}
                      onChange={(e) => set("name", e.target.value)}
                      onBlur={() => blur("name")}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(show("name"))}
                      placeholder="Frog Fuel"
                      className={inputClass(show("name"))}
                    />
                  )}
                </Field>
                <Field label="Symbol" error={show("symbol")} required counter={`${values.symbol.length}/${SYMBOL_MAX}`}>
                  {(id, describedBy) => (
                    <input
                      id={id}
                      value={values.symbol}
                      maxLength={SYMBOL_MAX}
                      onChange={(e) => set("symbol", normalizeSymbol(e.target.value))}
                      onBlur={() => blur("symbol")}
                      aria-describedby={describedBy}
                      aria-invalid={Boolean(show("symbol"))}
                      placeholder="FROG"
                      autoCapitalize="characters"
                      spellCheck={false}
                      className={`${inputClass(show("symbol"))} font-mono tracking-wider uppercase`}
                    />
                  )}
                </Field>
              </div>

              <Field
                label="Description"
                error={show("description")}
                counter={`${values.description.length}/${DESCRIPTION_MAX}`}
                counterOver={values.description.length > DESCRIPTION_MAX}
              >
                {(id, describedBy) => (
                  <textarea
                    id={id}
                    rows={3}
                    value={values.description}
                    onChange={(e) => set("description", e.target.value)}
                    onBlur={() => blur("description")}
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(show("description"))}
                    placeholder="What's the coin about?"
                    className={`${inputClass(show("description"))} h-auto resize-y py-2`}
                  />
                )}
              </Field>

              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-1.5 text-xs text-zinc-400">Links (optional)</legend>
                {LINK_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label} error={show(f.key)}>
                    {(id, describedBy) => (
                      <input
                        id={id}
                        type="url"
                        inputMode="url"
                        value={values[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                        onBlur={() => blur(f.key)}
                        aria-describedby={describedBy}
                        aria-invalid={Boolean(show(f.key))}
                        placeholder={f.placeholder}
                        className={inputClass(show(f.key))}
                      />
                    )}
                  </Field>
                ))}
              </fieldset>
            </form>
          )}

          {(current === "approve" || current === "launching") && (
            <Status
              title={current === "approve" ? "Approve in your wallet" : "Launching…"}
              body={
                current === "approve"
                  ? costSol
                    ? `Confirm in your wallet. This launch costs about ${costSol.toFixed(4)} SOL (rent and network fees). Keep this window open.`
                    : "Sign in and confirm in your wallet when it asks. Keep this window open."
                  : mint
                    ? "Launched. Waiting for its truck to roll into the hub…"
                    : "Creating the coin. This can take a few seconds."
              }
              spinner
            />
          )}

          {current === "arrived" && mint && (
            <Status
              title={`$${values.symbol} has arrived`}
              body="Its truck is in the hub. Follow it through intake to the Launch Bay."
              image={preview}
            />
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3.5">
          {current === "details" && (
            <>
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5">
                Cancel
              </button>
              {wallet ? (
                <button
                  type="submit"
                  form="launch-form"
                  className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold tracking-wider text-black hover:bg-amber-300"
                >
                  <RocketIcon /> LAUNCH
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openWalletPicker}
                  className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold tracking-wider text-black hover:bg-amber-300"
                >
                  <WalletIcon /> CONNECT WALLET
                </button>
              )}
            </>
          )}
          {busy && <p className="text-xs text-zinc-500">Don&apos;t close this window.</p>}
          {current === "arrived" && mint && (
            <>
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  focusMint(mint);
                  onClose();
                }}
                className="rounded-lg bg-amber-400 px-4 py-2 font-display text-sm font-bold tracking-wider text-black hover:bg-amber-300"
              >
                FOLLOW TRUCK
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: LaunchStep }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-1 border-b border-edge px-5 py-3" aria-label="Launch progress">
      {STEPS.map((s, i) => {
        const done = i < index || current === "arrived";
        const on = i === index && current !== "arrived";
        return (
          <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={on ? "step" : undefined}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? "bg-emerald-500 text-black" : on ? "border-2 border-amber-400 text-amber-400" : "border-2 border-zinc-600 text-zinc-500"
              }`}
            >
              {done ? <CheckIcon /> : i + 1}
            </span>
            <span
              className={`truncate text-[11px] font-semibold sm:inline sm:text-xs ${on ? "text-amber-400" : `hidden ${done ? "text-zinc-200" : "text-zinc-500"}`}`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className={`mx-1 hidden h-px flex-1 sm:block ${done ? "bg-emerald-500/60" : "bg-white/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  error,
  required,
  counter,
  counterOver,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  counter?: string;
  counterOver?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-zinc-300">
          {label}
          {required && <span className="text-amber-400"> *</span>}
        </label>
        {counter && <span className={`text-[11px] tabular-nums ${counterOver ? "text-red-400" : "text-zinc-500"}`}>{counter}</span>}
      </div>
      {children(id, error ? errorId : undefined)}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(error: string | undefined): string {
  return `h-10 w-full rounded-lg border bg-black/30 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none ${
    error ? "border-red-500/60 focus:border-red-400" : "border-edge focus:border-amber-400/60"
  }`;
}

function Status({ title, body, spinner, image }: { title: string; body: string; spinner?: boolean; image?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
      {spinner && <span className="h-10 w-10 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" />}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview
        <img src={image} alt="" className="h-20 w-20 rounded-xl object-cover ring-2 ring-emerald-400" />
      )}
      <p className="font-display text-lg font-bold text-zinc-50">{title}</p>
      <p className="max-w-sm text-sm text-zinc-400">{body}</p>
    </div>
  );
}
