import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getCatalog, getTitle } from "../lib/content/browser";
import { catalogLabel } from "../lib/content/libraryGroups";
import { getLine } from "../lib/content/lines";
import { getNextPlayableLine } from "../lib/content/playable";
import { loadQuoteBackdrop } from "../lib/quoteImage/loadQuoteImage";
import {
  loadQuoteImagePrefs,
  saveQuoteImagePrefs,
  type QuoteImageAspect,
  type QuoteImageFormat,
  type QuoteImagePalette,
} from "../lib/quoteImage/prefs";
import { canvasToPngBlob, renderQuoteImageCanvas } from "../lib/quoteImage/renderQuoteImage";

type Props = {
  titleId: string;
  lineIndex: number;
  /** Fallback when catalog text is missing. */
  quoteText?: string;
  onClose: () => void;
};

const ASPECT_OPTIONS: { id: QuoteImageAspect; label: string }[] = [
  { id: "portrait", label: "Portrait" },
  { id: "square", label: "Square" },
  { id: "story", label: "Story" },
];

const PALETTE_OPTIONS: { id: QuoteImagePalette; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "ink", label: "Ink" },
  { id: "lime", label: "Lime" },
];

function canShareFiles(): boolean {
  try {
    const file = new File(["x"], "t.txt", { type: "text/plain" });
    return typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

export function QuoteImageExportModal({ titleId, lineIndex, quoteText, onClose }: Props) {
  const title = getTitle(titleId);
  const entry = getCatalog().titles.find((item) => item.id === titleId);
  const resolvedQuote =
    (title ? getLine(title, lineIndex)?.text : undefined)?.trim() ||
    quoteText?.trim() ||
    `Line ${lineIndex + 1}`;
  const resolvedNext = title
    ? (getNextPlayableLine(title, lineIndex)?.text ?? "").trim() || null
    : null;
  const titleLabel = entry ? catalogLabel(entry) : titleId;

  const initialPrefs = useMemo(() => loadQuoteImagePrefs(), []);
  const [format, setFormat] = useState<QuoteImageFormat>(initialPrefs.format);
  const [aspect, setAspect] = useState<QuoteImageAspect>(initialPrefs.aspect);
  const [palette, setPalette] = useState<QuoteImagePalette>(initialPrefs.palette);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shareSupported = useMemo(() => canShareFiles(), []);

  function updateFormat(next: QuoteImageFormat) {
    setFormat(next);
    saveQuoteImagePrefs({ format: next });
  }

  function updateAspect(next: QuoteImageAspect) {
    setAspect(next);
    saveQuoteImagePrefs({ aspect: next });
  }

  function updatePalette(next: QuoteImagePalette) {
    setPalette(next);
    saveQuoteImagePrefs({ palette: next });
  }

  useEffect(() => {
    let cancelled = false;
    void loadQuoteBackdrop(titleId, lineIndex).then((loaded) => {
      if (!cancelled) setImage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [titleId, lineIndex]);

  useEffect(() => {
    let objectUrl: string | null = null;
    try {
      const canvas = renderQuoteImageCanvas({
        format,
        aspect,
        palette,
        quoteText: resolvedQuote,
        nextText: resolvedNext,
        titleLabel,
        image,
      });
      objectUrl = canvas.toDataURL("image/png");
      setPreviewUrl(objectUrl);
      setError(null);
    } catch (err) {
      setPreviewUrl(null);
      setError(err instanceof Error ? err.message : "Could not render preview");
    }
    return () => {
      void objectUrl;
    };
  }, [format, aspect, palette, resolvedQuote, resolvedNext, titleLabel, image]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function buildBlob(): Promise<Blob> {
    const canvas = renderQuoteImageCanvas({
      format,
      aspect,
      palette,
      quoteText: resolvedQuote,
      nextText: resolvedNext,
      titleLabel,
      image,
    });
    return canvasToPngBlob(canvas);
  }

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const blob = await buildBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tlnl-quote-${titleId}-${lineIndex}-${aspect}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
    setBusy(false);
  }

  async function handleShare() {
    setBusy(true);
    setError(null);
    try {
      const blob = await buildBlob();
      const file = new File([blob], `tlnl-quote-${titleId}-${lineIndex}-${aspect}.png`, {
        type: "image/png",
      });
      await navigator.share({
        files: [file],
        title: titleLabel,
        text: resolvedNext ? `${resolvedQuote}\n${resolvedNext}` : resolvedQuote,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setBusy(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Share failed");
    }
    setBusy(false);
  }

  return createPortal(
    <div className="quote-image-backdrop" role="presentation" onClick={onClose}>
      <div
        className="quote-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-image-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="quote-image-header">
          <h3 id="quote-image-title">Export image</h3>
          <button type="button" className="button ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="quote-image-formats" role="radiogroup" aria-label="Format">
          <button
            type="button"
            className={`quote-image-format${format === "caption-below" ? " is-active" : ""}`}
            role="radio"
            aria-checked={format === "caption-below"}
            onClick={() => updateFormat("caption-below")}
          >
            Caption below
          </button>
          <button
            type="button"
            className={`quote-image-format${format === "on-image" ? " is-active" : ""}`}
            role="radio"
            aria-checked={format === "on-image"}
            onClick={() => updateFormat("on-image")}
          >
            On image
          </button>
        </div>

        <div className="quote-image-row" role="radiogroup" aria-label="Aspect">
          {ASPECT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`quote-image-chip${aspect === option.id ? " is-active" : ""}`}
              role="radio"
              aria-checked={aspect === option.id}
              onClick={() => updateAspect(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="quote-image-row" role="radiogroup" aria-label="Palette">
          {PALETTE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`quote-image-chip quote-image-palette-${option.id}${
                palette === option.id ? " is-active" : ""
              }`}
              role="radio"
              aria-checked={palette === option.id}
              onClick={() => updatePalette(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="quote-image-preview-wrap">
          {previewUrl ? (
            <img className="quote-image-preview" src={previewUrl} alt="Quote card preview" />
          ) : (
            <p className="muted">Rendering…</p>
          )}
        </div>

        <div className="quote-image-actions">
          <button
            type="button"
            className="button primary"
            disabled={busy || !previewUrl}
            onClick={() => void handleDownload()}
          >
            {busy ? "…" : "Download PNG"}
          </button>
          {shareSupported ? (
            <button
              type="button"
              className="button ghost"
              disabled={busy || !previewUrl}
              onClick={() => void handleShare()}
            >
              Share…
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="feedback wrong" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
