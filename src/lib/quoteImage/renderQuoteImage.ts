export type QuoteImageFormat = "caption-below" | "on-image";

export type RenderQuoteImageInput = {
  format: QuoteImageFormat;
  quoteText: string;
  titleLabel: string;
  image: HTMLImageElement | null;
};

export const QUOTE_IMAGE_WIDTH = 1080;
export const QUOTE_IMAGE_HEIGHT = 1350;

const BRAND = "Textline → Nextline";
const PLUM = "#4f345a";
const MINT = "#9cbfa7";
const BG = "#e8f0ea";
const RAISED = "#f4f8f5";
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

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

function drawBrandFallback(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, MINT);
  gradient.addColorStop(1, PLUM);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(244, 248, 245, 0.88)";
  ctx.font = `600 42px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(BRAND, x + w / 2, y + h / 2);
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (image) drawCoverImage(ctx, image, x, y, w, h);
  else drawBrandFallback(ctx, x, y, w, h);
}

function renderCaptionBelow(
  ctx: CanvasRenderingContext2D,
  quoteText: string,
  titleLabel: string,
  image: HTMLImageElement | null,
) {
  const w = QUOTE_IMAGE_WIDTH;
  const h = QUOTE_IMAGE_HEIGHT;
  const imageH = Math.round(h * 0.58);
  const pad = 72;

  ctx.fillStyle = RAISED;
  ctx.fillRect(0, 0, w, h);
  drawBackdrop(ctx, image, 0, 0, w, imageH);

  ctx.fillStyle = RAISED;
  ctx.fillRect(0, imageH, w, h - imageH);

  const textMax = w - pad * 2;
  ctx.fillStyle = PLUM;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 54px ${SERIF}`;
  const quoteLines = wrapLines(ctx, quoteText, textMax, 7);
  let y = imageH + 64;
  for (const line of quoteLines) {
    ctx.fillText(line, pad, y);
    y += 68;
  }

  ctx.font = `500 28px ${SERIF}`;
  ctx.fillStyle = "rgba(79, 52, 90, 0.72)";
  ctx.fillText(titleLabel, pad, Math.min(y + 36, h - 120));

  ctx.font = `600 24px ${SERIF}`;
  ctx.fillStyle = "rgba(79, 52, 90, 0.55)";
  ctx.fillText(BRAND, pad, h - 64);
}

function renderOnImage(
  ctx: CanvasRenderingContext2D,
  quoteText: string,
  titleLabel: string,
  image: HTMLImageElement | null,
) {
  const w = QUOTE_IMAGE_WIDTH;
  const h = QUOTE_IMAGE_HEIGHT;
  const pad = 80;

  drawBackdrop(ctx, image, 0, 0, w, h);

  const veil = ctx.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, "rgba(79, 52, 90, 0.35)");
  veil.addColorStop(0.45, "rgba(79, 52, 90, 0.55)");
  veil.addColorStop(1, "rgba(79, 52, 90, 0.72)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);

  const textMax = w - pad * 2;
  ctx.fillStyle = "#f4f8f5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 56px ${SERIF}`;
  const quoteLines = wrapLines(ctx, quoteText, textMax, 8);
  const lineH = 72;
  const blockH = quoteLines.length * lineH;
  let y = h / 2 - blockH / 2 + lineH / 2;
  for (const line of quoteLines) {
    ctx.fillText(line, w / 2, y);
    y += lineH;
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 26px ${SERIF}`;
  ctx.fillStyle = "rgba(244, 248, 245, 0.85)";
  ctx.fillText(titleLabel, pad, h - 88);

  ctx.textAlign = "right";
  ctx.font = `600 24px ${SERIF}`;
  ctx.fillStyle = "rgba(201, 242, 153, 0.95)";
  ctx.fillText(BRAND, w - pad, h - 88);
}

export function renderQuoteImageCanvas(input: RenderQuoteImageInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = QUOTE_IMAGE_WIDTH;
  canvas.height = QUOTE_IMAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (input.format === "caption-below") {
    renderCaptionBelow(ctx, input.quoteText, input.titleLabel, input.image);
  } else {
    renderOnImage(ctx, input.quoteText, input.titleLabel, input.image);
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
