import { describe, expect, it } from "vitest";
import { EMPTY_LAUNCH_FORM, normalizeSymbol, toLaunchFormData, validateLaunchForm, type LaunchFormValues } from "./launchForm";

const png = new File([new Uint8Array(10)], "logo.png", { type: "image/png" });
const valid: LaunchFormValues = { ...EMPTY_LAUNCH_FORM, image: png, name: "Frog Fuel", symbol: "FROG", description: "Ribbit." };

describe("launch form", () => {
  it("accepts a complete form and trims it into launch data", () => {
    expect(validateLaunchForm(valid)).toEqual({});
    expect(toLaunchFormData({ ...valid, name: "  Frog Fuel ", website: " https://frog.fun " })).toEqual({
      image: png,
      name: "Frog Fuel",
      symbol: "FROG",
      description: "Ribbit.",
      twitter: undefined,
      telegram: undefined,
      website: "https://frog.fun",
    });
  });

  it("requires image, name and symbol", () => {
    expect(Object.keys(validateLaunchForm(EMPTY_LAUNCH_FORM)).sort()).toEqual(["image", "name", "symbol"]);
    expect(toLaunchFormData(EMPTY_LAUNCH_FORM)).toBeNull();
  });

  it("enforces length limits", () => {
    expect(validateLaunchForm({ ...valid, name: "x".repeat(33) }).name).toBeDefined();
    expect(validateLaunchForm({ ...valid, name: "x".repeat(32) }).name).toBeUndefined();
    expect(validateLaunchForm({ ...valid, symbol: "ABCDEFGHIJK" }).symbol).toBeDefined();
    expect(validateLaunchForm({ ...valid, description: "x".repeat(501) }).description).toBeDefined();
  });

  it("uppercases symbols and allows only A–Z and 0–9", () => {
    expect(normalizeSymbol("frog 2")).toBe("FROG2");
    expect(validateLaunchForm({ ...valid, symbol: normalizeSymbol("fr-og") }).symbol).toMatch(/A–Z/);
  });

  it("checks optional links point where they say", () => {
    expect(validateLaunchForm({ ...valid, twitter: "https://x.com/frog" }).twitter).toBeUndefined();
    expect(validateLaunchForm({ ...valid, twitter: "https://evil.com/frog" }).twitter).toBeDefined();
    expect(validateLaunchForm({ ...valid, telegram: "https://t.me/frog" }).telegram).toBeUndefined();
    expect(validateLaunchForm({ ...valid, website: "frog.fun" }).website).toBeDefined();
  });

  it("rejects non-image and oversized files", () => {
    const pdf = new File(["x"], "x.pdf", { type: "application/pdf" });
    expect(validateLaunchForm({ ...valid, image: pdf }).image).toBeDefined();
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    expect(validateLaunchForm({ ...valid, image: big }).image).toBeDefined();
  });
});
