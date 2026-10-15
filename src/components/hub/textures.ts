import * as THREE from "three";
import { RefCache } from "./refCache";

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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawLabel(ctx: CanvasRenderingContext2D, o: LabelOptions, r: Rect) {
  const pad = Math.round(r.h * 0.08);
  ctx.save();
  ctx.fillStyle = o.background;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.h * 0.12);
  ctx.fill();
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(2, r.h * 0.05);
    ctx.beginPath();
    ctx.roundRect(r.x + pad / 2, r.y + pad / 2, r.w - pad, r.h - pad, r.h * 0.1);
    ctx.stroke();
  }
  ctx.fillStyle = o.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitText(ctx, o.text, r.w - pad * 4, r.h * (o.subtitle ? 0.5 : 0.62), "800");
  ctx.fillText(o.text, r.x + r.w / 2, r.y + r.h * (o.subtitle ? 0.38 : 0.53));
  if (o.subtitle) {
    ctx.globalAlpha = 0.8;
    fitText(ctx, o.subtitle, r.w - pad * 4, r.h * 0.26, "600");
    ctx.fillText(o.subtitle, r.x + r.w / 2, r.y + r.h * 0.74);
  }
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: string) {
  let px = Math.floor(size);
  do {
    ctx.font = `${weight} ${px}px "Arial Black", Arial, Helvetica, sans-serif`;
    px -= 2;
  } while (px > 8 && ctx.measureText(text).width > maxWidth);
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const labelTextures = new Map<string, THREE.CanvasTexture>();

/** Static label texture (signs, dock numbers). A fixed set, so it's cached for the page's life. */
export function labelTexture(options: LabelOptions): THREE.CanvasTexture {
  const { width = 512, height = 128 } = options;
  const key = JSON.stringify(options);
  let texture = labelTextures.get(key);
  if (!texture) {
    texture = canvasTexture(width, height, (ctx) => drawLabel(ctx, options, { x: 0, y: 0, w: width, h: height }));
    labelTextures.set(key, texture);
  }
  return texture;
}

// ---------------------------------------------------------------------------
// Per-coin textures. Reference-counted: acquired when a truck (or crate stack)
// needs them, disposed when the last user releases them, e.g. when a truck
// departs the hub or parks in the overflow lot.

/** Trailer decal: coin logo (left half) plus the ticker plate (top of the right half). */
const DECAL = { width: 256, height: 128, logo: 128, plateHeight: 43 };

/** UV rectangles in the decal texture, as [u0, v0, u1, v1] (v up). */
export const DECAL_UV = {
  logo: [0, 0, 0.5, 1],
  plate: [0.5, 1 - DECAL.plateHeight / DECAL.height, 1, 1],
} as const;

export interface DecalSpec {
  mint: string;
  symbol: string;
  imageUrl: string;
  /** Fallback plate colour while the image loads or if it can't be used. */
  color: string;
}

const decals = new RefCache<THREE.CanvasTexture>();

export function decalKey(spec: DecalSpec): string {
  return `${spec.mint}|${spec.symbol}|${spec.imageUrl}`;
}

export function acquireDecal(spec: DecalSpec): THREE.CanvasTexture {
  return decals.acquire(decalKey(spec), () => createDecal(spec));
}

export function releaseDecal(spec: DecalSpec): void {
  decals.release(decalKey(spec));
}

function createDecal(spec: DecalSpec): THREE.CanvasTexture {
  const logoRect = { x: 0, y: 0, w: DECAL.logo, h: DECAL.logo };
  const texture = canvasTexture(DECAL.width, DECAL.height, (ctx) => {
    drawLabel(ctx, { text: spec.symbol, background: spec.color, color: "#ffffff", border: "#ffffff55" }, logoRect);
    drawLabel(
      ctx,
      { text: spec.symbol, background: "#0c1016", color: "#ffb13b", border: "#ffb13b" },
      { x: DECAL.logo, y: 0, w: DECAL.width - DECAL.logo, h: DECAL.plateHeight },
    );
  });

  if (spec.imageUrl) {
    let disposed = false;
    texture.addEventListener("dispose", () => (disposed = true));
    const image = new Image();
    // Ask for CORS up front so a host without CORS headers fails the load here
    // (keeping the ticker plate) instead of tainting the canvas.
    // TODO(image-proxy): pump.fun images usually sit on IPFS gateways and other
    // third-party hosts, many of which send no CORS headers, so real coins may
    // keep the plate. If that happens a lot, add a same-origin proxy route
    // (e.g. src/app/api/coin-image/route.ts) and load through it.
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      const ctx = (texture.image as HTMLCanvasElement).getContext("2d")!;
      ctx.clearRect(logoRect.x, logoRect.y, logoRect.w, logoRect.h);
      // Cover-fit the square.
      const s = Math.max(logoRect.w / image.naturalWidth, logoRect.h / image.naturalHeight);
      const w = image.naturalWidth * s;
      const h = image.naturalHeight * s;
      ctx.drawImage(image, (logoRect.w - w) / 2, (logoRect.h - h) / 2, w, h);
      texture.needsUpdate = true;
    };
    image.src = spec.imageUrl;
  }
  return texture;
}

const crates = new RefCache<THREE.CanvasTexture>();

/** Ticker-stamped crate texture, shared by dock stacks and forklifts. Pair with `releaseCrateTexture`. */
export function acquireCrateTexture(symbol: string): THREE.CanvasTexture {
  return crates.acquire(symbol, () =>
    canvasTexture(128, 128, (ctx) =>
      drawLabel(ctx, { text: symbol, background: "#b98a4a", color: "#2a1a08", border: "#5a3d17" }, { x: 0, y: 0, w: 128, h: 128 }),
    ),
  );
}

export function releaseCrateTexture(symbol: string): void {
  crates.release(symbol);
}

// ---------------------------------------------------------------------------
// Soft radial glow for light pools on the floor.

let glow: THREE.CanvasTexture | null = null;

export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const size = 256;
  glow = canvasTexture(size, size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
  glow.colorSpace = THREE.NoColorSpace;
  return glow;
}
