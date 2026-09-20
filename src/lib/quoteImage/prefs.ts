export type QuoteImageFormat = "caption-below" | "on-image";
export type QuoteImageAspect = "portrait" | "square" | "story" | "original";
export type QuoteImagePalette = "clean" | "ink" | "lime" | "none";

export type QuoteImagePrefs = {
  format: QuoteImageFormat;
  aspect: QuoteImageAspect;
  palette: QuoteImagePalette;
};

const STORAGE_KEY = "tlnl.quoteImagePrefs";

export const DEFAULT_QUOTE_IMAGE_PREFS: QuoteImagePrefs = {
  format: "caption-below",
  aspect: "portrait",
  palette: "clean",
};

const ASPECTS = new Set<QuoteImageAspect>(["portrait", "square", "story", "original"]);
const PALETTES = new Set<QuoteImagePalette>(["clean", "ink", "lime", "none"]);
const FORMATS = new Set<QuoteImageFormat>(["caption-below", "on-image"]);

function isPrefs(value: unknown): value is QuoteImagePrefs {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    FORMATS.has(record.format as QuoteImageFormat) &&
    ASPECTS.has(record.aspect as QuoteImageAspect) &&
    PALETTES.has(record.palette as QuoteImagePalette)
  );
}

export function loadQuoteImagePrefs(): QuoteImagePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_QUOTE_IMAGE_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!isPrefs(parsed)) return { ...DEFAULT_QUOTE_IMAGE_PREFS };
    return parsed;
  } catch {
    return { ...DEFAULT_QUOTE_IMAGE_PREFS };
  }
}

export function saveQuoteImagePrefs(partial: Partial<QuoteImagePrefs>): QuoteImagePrefs {
  const next = { ...loadQuoteImagePrefs(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode.
  }
  return next;
}

/** Placeholder size for Original when no image; real size comes from the still. */
export function sizeForAspect(aspect: QuoteImageAspect): { width: number; height: number } {
  switch (aspect) {
    case "square":
      return { width: 1080, height: 1080 };
    case "story":
      return { width: 1080, height: 1920 };
    case "original":
    case "portrait":
    default:
      return { width: 1080, height: 1350 };
  }
}

/** Canvas size for Original: native still ratio, long edge 1080. */
export function sizeForOriginalImage(image: {
  naturalWidth: number;
  naturalHeight: number;
}): { width: number; height: number } {
  const nw = image.naturalWidth || 1080;
  const nh = image.naturalHeight || 1350;
  const long = Math.max(nw, nh);
  const scale = 1080 / long;
  return {
    width: Math.max(1, Math.round(nw * scale)),
    height: Math.max(1, Math.round(nh * scale)),
  };
}

export function imageBandRatio(aspect: QuoteImageAspect): number {
  switch (aspect) {
    case "square":
      return 0.48;
    case "story":
      return 0.45;
    case "original":
      return 0.55;
    case "portrait":
    default:
      return 0.52;
  }
}
