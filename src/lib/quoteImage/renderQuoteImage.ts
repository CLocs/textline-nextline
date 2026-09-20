import {
  imageBandRatio,
  sizeForAspect,
  sizeForOriginalImage,
  type QuoteImageAspect,
  type QuoteImageFormat,
  type QuoteImagePalette,
} from "./prefs";

export type { QuoteImageAspect, QuoteImageFormat, QuoteImagePalette };

export type RenderQuoteImageInput = {
  format: QuoteImageFormat;
  aspect: QuoteImageAspect;
  palette: QuoteImagePalette;
  quoteText: string;
  /** Correct next line; omitted when missing from the transcript. */
  nextText?: string | null;
  titleLabel: string;
  image: HTMLImageElement | null;
};

const BRAND = "Textline → Nextline";
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

type PaletteTokens = {
  canvasBg: string;
  captionBand: string;
  prompt: string;
  next: string;
  meta: string;
  brand: string;
  brandAccent: string;
  fallbackFrom: string;
  fallbackTo: string;
  fallbackMark: string;
  veilStops: [string, string, string];
  onPrompt: string;
  onNext: string;
  onMeta: string;
  textShadow: boolean;
};

function paletteTokens(palette: QuoteImagePalette): PaletteTokens {
  switch (palette) {
    case "ink":
      return {
        canvasBg: "#3a2642",
        captionBand: "#4f345a",
        prompt: "rgba(244, 248, 245, 0.78)",
        next: "#f4f8f5",
        meta: "rgba(244, 248, 245, 0.72)",
        brand: "rgba(201, 242, 153, 0.9)",
        brandAccent: "rgba(201, 242, 153, 0.95)",
        fallbackFrom: "#5d4e6d",
        fallbackTo: "#4f345a",
        fallbackMark: "rgba(244, 248, 245, 0.9)",
        veilStops: ["rgba(30, 18, 36, 0.45)", "rgba(30, 18, 36, 0.62)", "rgba(30, 18, 36, 0.78)"],
        onPrompt: "rgba(244, 248, 245, 0.82)",
        onNext: "#f4f8f5",
        onMeta: "rgba(244, 248, 245, 0.85)",
        textShadow: false,
      };
    case "lime":
      return {
        canvasBg: "#e8f0ea",
        captionBand: "#eef8e4",
        prompt: "rgba(79, 52, 90, 0.7)",
        next: "#4f345a",
        meta: "rgba(79, 52, 90, 0.7)",
        brand: "rgba(79, 52, 90, 0.55)",
        brandAccent: "#4f345a",
        fallbackFrom: "#c9f299",
        fallbackTo: "#8fa998",
        fallbackMark: "#4f345a",
        veilStops: ["rgba(79, 52, 90, 0.28)", "rgba(79, 52, 90, 0.48)", "rgba(79, 52, 90, 0.66)"],
        onPrompt: "rgba(244, 248, 245, 0.88)",
        onNext: "#c9f299",
        onMeta: "rgba(244, 248, 245, 0.9)",
        textShadow: false,
      };
    case "none":
      return {
        canvasBg: "#f4f8f5",
        captionBand: "#f4f8f5",
        prompt: "rgba(79, 52, 90, 0.78)",
        next: "#4f345a",
        meta: "rgba(79, 52, 90, 0.72)",
        brand: "rgba(79, 52, 90, 0.55)",
        brandAccent: "#f4f8f5",
        fallbackFrom: "#9cbfa7",
        fallbackTo: "#4f345a",
        fallbackMark: "rgba(244, 248, 245, 0.88)",
        veilStops: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"],
        onPrompt: "#f4f8f5",
        onNext: "#ffffff",
        onMeta: "#f4f8f5",
        textShadow: true,
      };
    case "clean":
    default:
      return {
        canvasBg: "#e8f0ea",
        captionBand: "#f4f8f5",
        prompt: "rgba(79, 52, 90, 0.72)",
        next: "#4f345a",
        meta: "rgba(79, 52, 90, 0.72)",
        brand: "rgba(79, 52, 90, 0.55)",
        brandAccent: "rgba(201, 242, 153, 0.95)",
        fallbackFrom: "#9cbfa7",
        fallbackTo: "#4f345a",
        fallbackMark: "rgba(244, 248, 245, 0.88)",
        veilStops: ["rgba(79, 52, 90, 0.35)", "rgba(79, 52, 90, 0.55)", "rgba(79, 52, 90, 0.72)"],
        onPrompt: "rgba(244, 248, 245, 0.82)",
        onNext: "#f4f8f5",
        onMeta: "rgba(244, 248, 245, 0.85)",
        textShadow: false,
      };
  }
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const trial = `${current} ${word}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines) {
    lines.push(current);
  } else {
    const last = lines[lines.length - 1] ?? current;
    let clipped = last;
    while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    lines[lines.length - 1] = `${clipped}…`;
  }

  return lines;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

/** Full scene, letterbox/pillarbox — no crop. */
function drawContainImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function drawBrandFallback(
  ctx: CanvasRenderingContext2D,
  tokens: PaletteTokens,
  x: number,
  y: number,
  w: number,
  h: number,
  markSize: number,
) {
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, tokens.fallbackFrom);
  gradient.addColorStop(1, tokens.fallbackTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = tokens.fallbackMark;
  ctx.font = `600 ${markSize}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(BRAND, x + w / 2, y + h / 2);
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  tokens: PaletteTokens,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  markSize: number,
  contain: boolean,
) {
  if (image) {
    if (contain) drawContainImage(ctx, image, x, y, w, h);
    else drawCoverImage(ctx, image, x, y, w, h);
  } else {
    drawBrandFallback(ctx, tokens, x, y, w, h, markSize);
  }
}

function withTextShadow(ctx: CanvasRenderingContext2D, enabled: boolean, draw: () => void) {
  if (enabled) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  }
  draw();
  if (enabled) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

function layoutScale(width: number, height: number): number {
  return Math.min(width, height) / 1080;
}

function canvasSizeFor(
  aspect: QuoteImageAspect,
  image: HTMLImageElement | null,
): { width: number; height: number } {
  if (aspect === "original" && image) return sizeForOriginalImage(image);
  return sizeForAspect(aspect);
}

function renderCaptionBelow(
  ctx: CanvasRenderingContext2D,
  input: RenderQuoteImageInput,
  tokens: PaletteTokens,
  width: number,
  height: number,
) {
  const scale = layoutScale(width, height);
  const imageH = Math.round(height * imageBandRatio(input.aspect));
  const pad = Math.round(72 * scale);
  const textMax = width - pad * 2;
  const hasNext = Boolean(input.nextText?.trim());
  const promptSize = Math.round(42 * scale);
  const nextSize = Math.round(52 * scale);
  const metaSize = Math.round(28 * scale);
  const brandSize = Math.round(24 * scale);
  const promptStep = Math.round(54 * scale);
  const nextStep = Math.round(64 * scale);
  const contain = input.aspect === "original";

  ctx.fillStyle = tokens.captionBand;
  ctx.fillRect(0, 0, width, height);
  // Letterbox fill behind contain draws
  if (contain) {
    ctx.fillStyle = tokens.canvasBg;
    ctx.fillRect(0, 0, width, imageH);
  }
  drawBackdrop(ctx, tokens, input.image, 0, 0, width, imageH, Math.round(42 * scale), contain);

  ctx.fillStyle = tokens.captionBand;
  ctx.fillRect(0, imageH, width, height - imageH);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = tokens.prompt;
  ctx.font = `500 ${promptSize}px ${SERIF}`;
  const promptLines = wrapLines(ctx, input.quoteText, textMax, hasNext ? 4 : 6);
  let y = imageH + Math.round(56 * scale);
  for (const line of promptLines) {
    ctx.fillText(line, pad, y);
    y += promptStep;
  }

  if (hasNext) {
    y += Math.round(18 * scale);
    ctx.fillStyle = tokens.next;
    ctx.font = `600 ${nextSize}px ${SERIF}`;
    const nextLines = wrapLines(ctx, input.nextText!.trim(), textMax, 4);
    for (const line of nextLines) {
      ctx.fillText(line, pad, y);
      y += nextStep;
    }
  }

  const footerY = Math.min(y + Math.round(36 * scale), height - Math.round(120 * scale));
  ctx.font = `500 ${metaSize}px ${SERIF}`;
  ctx.fillStyle = tokens.meta;
  ctx.fillText(input.titleLabel, pad, footerY);

  ctx.font = `600 ${brandSize}px ${SERIF}`;
  ctx.fillStyle = tokens.brand;
  ctx.fillText(BRAND, pad, height - Math.round(64 * scale));
}

function renderOnImage(
  ctx: CanvasRenderingContext2D,
  input: RenderQuoteImageInput,
  tokens: PaletteTokens,
  width: number,
  height: number,
) {
  const scale = layoutScale(width, height);
  const pad = Math.round(80 * scale);
  const textMax = width - pad * 2;
  const hasNext = Boolean(input.nextText?.trim());
  const promptSize = Math.round(44 * scale);
  const nextSize = Math.round(54 * scale);
  const metaSize = Math.round(26 * scale);
  const brandSize = Math.round(24 * scale);
  const promptH = Math.round(56 * scale);
  const nextH = Math.round(68 * scale);
  const gap = hasNext ? Math.round(28 * scale) : 0;
  const contain = input.aspect === "original";

  if (contain) {
    ctx.fillStyle = tokens.canvasBg;
    ctx.fillRect(0, 0, width, height);
  }
  drawBackdrop(ctx, tokens, input.image, 0, 0, width, height, Math.round(42 * scale), contain);

  const veilOpaque = tokens.veilStops.some((stop) => !stop.endsWith(", 0)"));
  if (veilOpaque) {
    const veil = ctx.createLinearGradient(0, 0, 0, height);
    veil.addColorStop(0, tokens.veilStops[0]);
    veil.addColorStop(0.45, tokens.veilStops[1]);
    veil.addColorStop(1, tokens.veilStops[2]);
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `500 ${promptSize}px ${SERIF}`;
  const promptLines = wrapLines(ctx, input.quoteText, textMax, hasNext ? 4 : 6);
  ctx.font = `600 ${nextSize}px ${SERIF}`;
  const nextLines = hasNext ? wrapLines(ctx, input.nextText!.trim(), textMax, 4) : [];

  const blockH = promptLines.length * promptH + gap + nextLines.length * nextH;
  let y = height / 2 - blockH / 2 + promptH / 2;

  withTextShadow(ctx, tokens.textShadow, () => {
    ctx.fillStyle = tokens.onPrompt;
    ctx.font = `500 ${promptSize}px ${SERIF}`;
    for (const line of promptLines) {
      ctx.fillText(line, width / 2, y);
      y += promptH;
    }

    if (hasNext) {
      y += gap - promptH / 2 + nextH / 2;
      ctx.fillStyle = tokens.onNext;
      ctx.font = `600 ${nextSize}px ${SERIF}`;
      for (const line of nextLines) {
        ctx.fillText(line, width / 2, y);
        y += nextH;
      }
    }
  });

  withTextShadow(ctx, tokens.textShadow, () => {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `500 ${metaSize}px ${SERIF}`;
    ctx.fillStyle = tokens.onMeta;
    ctx.fillText(input.titleLabel, pad, height - Math.round(88 * scale));

    ctx.textAlign = "right";
    ctx.font = `600 ${brandSize}px ${SERIF}`;
    ctx.fillStyle = tokens.brandAccent;
    ctx.fillText(BRAND, width - pad, height - Math.round(88 * scale));
  });
}

export function renderQuoteImageCanvas(input: RenderQuoteImageInput): HTMLCanvasElement {
  const { width, height } = canvasSizeFor(input.aspect, input.image);
  const tokens = paletteTokens(input.palette);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  ctx.fillStyle = tokens.canvasBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (input.format === "caption-below") {
    renderCaptionBelow(ctx, input, tokens, width, height);
  } else {
    renderOnImage(ctx, input, tokens, width, height);
  }

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export PNG"));
    }, "image/png");
  });
}
