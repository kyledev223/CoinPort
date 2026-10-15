import { useSyncExternalStore } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Coin images, cached by URL for the life of the page.

type CoinTextureEntry = {
  texture: THREE.Texture | null;
  failed: boolean;
  listeners: Set<() => void>;
};

const coinTextures = new Map<string, CoinTextureEntry>();
let loader: THREE.TextureLoader | null = null;

function coinTextureEntry(url: string): CoinTextureEntry {
  const cached = coinTextures.get(url);
  if (cached) return cached;

  const entry: CoinTextureEntry = { texture: null, failed: false, listeners: new Set() };
  coinTextures.set(url, entry);
  const settle = () => entry.listeners.forEach((notify) => notify());

  if (!url) {
    entry.failed = true;
    return entry;
  }

  // Ask for CORS up front so a host without CORS headers fails the load here,
  // instead of loading fine and then tainting the WebGL upload.
  // TODO(image-proxy): pump.fun images usually sit on IPFS gateways and other
  // third-party hosts, many of which send no CORS headers, so real coins may
  // fall back to the ticker plate. If that happens a lot, add a same-origin
  // proxy route (e.g. src/app/api/coin-image/route.ts) and load through it.
  loader ??= new THREE.TextureLoader().setCrossOrigin("anonymous");
  loader.load(
    url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      entry.texture = texture;
      settle();
    },
    undefined,
    () => {
      entry.failed = true;
      settle();
    },
  );
  return entry;
}

/** Coin image as a texture; null while loading or if it failed (render the fallback plate). */
export function useCoinTexture(url: string): THREE.Texture | null {
  const entry = coinTextureEntry(url);
  return useSyncExternalStore(
    (notify) => {
      entry.listeners.add(notify);
      return () => entry.listeners.delete(notify);
    },
    () => entry.texture,
    () => null,
  );
}

// ---------------------------------------------------------------------------
// Text drawn to canvas: signs, dock numbers, ticker plates. No font downloads.

export interface LabelOptions {
  text: string;
  subtitle?: string;
  background: string;
  color: string;
  border?: string;
  /** Canvas size in px; keep the aspect ratio of the plane it goes on. */
  width?: number;
  height?: number;
}

const labelTextures = new Map<string, THREE.CanvasTexture>();

export function labelTexture(options: LabelOptions): THREE.CanvasTexture {
  const { text, subtitle, background, color, border, width = 512, height = 128 } = options;
  const key = JSON.stringify([text, subtitle, background, color, border, width, height]);
  const cached = labelTextures.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const pad = Math.round(height * 0.08);

  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, height * 0.12);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(2, height * 0.05);
    ctx.beginPath();
    ctx.roundRect(pad / 2, pad / 2, width - pad, height - pad, height * 0.1);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const titleShare = subtitle ? 0.5 : 0.62;
  fitText(ctx, text, width - pad * 4, height * titleShare, "800");
  ctx.fillText(text, width / 2, subtitle ? height * 0.38 : height * 0.53);
  if (subtitle) {
    ctx.globalAlpha = 0.8;
    fitText(ctx, subtitle, width - pad * 4, height * 0.26, "600");
    ctx.fillText(subtitle, width / 2, height * 0.74);
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  labelTextures.set(key, texture);
  return texture;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: string) {
  let px = Math.floor(size);
  do {
    ctx.font = `${weight} ${px}px "Arial Black", Arial, Helvetica, sans-serif`;
    px -= 2;
  } while (px > 8 && ctx.measureText(text).width > maxWidth);
}

// ---------------------------------------------------------------------------
// Soft radial glow for light pools on the floor.

let glow: THREE.CanvasTexture | null = null;

export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  return glow;
}
