/** Launch-coin form: field limits, normalisation and client-side validation. Pure. */

export const NAME_MAX = 32;
export const SYMBOL_MAX = 10;
export const DESCRIPTION_MAX = 500;
/** Our own client-side cap on the logo file; revisit when the real upload is wired up. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export interface LaunchFormValues {
  image: File | null;
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
}

/** What `onLaunch` receives: validated and trimmed, optional links omitted when empty. */
export interface LaunchFormData {
  image: File;
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export type LaunchFormErrors = Partial<Record<keyof LaunchFormValues, string>>;

export const EMPTY_LAUNCH_FORM: LaunchFormValues = {
  image: null,
  name: "",
  symbol: "",
  description: "",
  twitter: "",
  telegram: "",
  website: "",
};

/** Symbol as typed → uppercase, no spaces. Other characters stay so validation can point them out. */
export function normalizeSymbol(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "");
}

function httpUrl(value: string, hosts?: readonly string[]): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return !hosts || hosts.includes(url.hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

export function validateLaunchForm(v: LaunchFormValues): LaunchFormErrors {
  const errors: LaunchFormErrors = {};

  if (!v.image) errors.image = "Add a coin image.";
  else if (!(IMAGE_TYPES as readonly string[]).includes(v.image.type)) errors.image = "Use a PNG, JPG, GIF or WebP image.";
  else if (v.image.size > IMAGE_MAX_BYTES) errors.image = `Image must be ${IMAGE_MAX_BYTES / 1024 / 1024} MB or smaller.`;

  const name = v.name.trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > NAME_MAX) errors.name = `Name can be at most ${NAME_MAX} characters.`;

  if (!v.symbol) errors.symbol = "Symbol is required.";
  else if (v.symbol.length > SYMBOL_MAX) errors.symbol = `Symbol can be at most ${SYMBOL_MAX} characters.`;
  else if (!/^[A-Z0-9]+$/.test(v.symbol)) errors.symbol = "Use only letters A–Z and digits 0–9.";

  if (v.description.length > DESCRIPTION_MAX) errors.description = `Description can be at most ${DESCRIPTION_MAX} characters.`;

  const twitter = v.twitter.trim();
  if (twitter && !httpUrl(twitter, ["x.com", "twitter.com"])) errors.twitter = "Use an x.com or twitter.com link.";
  const telegram = v.telegram.trim();
  if (telegram && !httpUrl(telegram, ["t.me", "telegram.me"])) errors.telegram = "Use a t.me link.";
  const website = v.website.trim();
  if (website && !httpUrl(website)) errors.website = "Use a full link starting with https://";

  return errors;
}

/** The validated payload, or null if the form has errors. */
export function toLaunchFormData(v: LaunchFormValues): LaunchFormData | null {
  if (!v.image || Object.keys(validateLaunchForm(v)).length > 0) return null;
  const optional = (s: string) => s.trim() || undefined;
  return {
    image: v.image,
    name: v.name.trim(),
    symbol: v.symbol,
    description: v.description.trim(),
    twitter: optional(v.twitter),
    telegram: optional(v.telegram),
    website: optional(v.website),
  };
}
