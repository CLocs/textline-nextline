import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getCatalog, getTitle } from "../lib/content/browser";
import { catalogLabel } from "../lib/content/libraryGroups";
import { getLine } from "../lib/content/lines";
import { getNextPlayableLine } from "../lib/content/playable";
import { leadInForPrompt } from "../lib/game/promptContext";
import { loadQuoteBackdrop } from "../lib/quoteImage/loadQuoteImage";
import {
  loadQuoteImagePrefs,
  saveQuoteImagePrefs,
  type QuoteImageAspect,
  type QuoteImageFormat,
  type QuoteImagePalette,
  type QuoteImageTextAlign,
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
  { id: "original", label: "Original" },
];

const PALETTE_OPTIONS: { id: QuoteImagePalette; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "ink", label: "Ink" },
  { id: "lime", label: "Lime" },
  { id: "none", label: "None" },
];

const TEXT_ALIGN_OPTIONS: { id: QuoteImageTextAlign; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
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
  const availableLeadIn = useMemo(
    () => (title ? leadInForPrompt(title, lineIndex).map((lead) => lead.text) : []),
    [title, lineIndex],
  );
  const titleLabel = entry ? catalogLabel(entry) : titleId;

  const initialPrefs = useMemo(() => loadQuoteImagePrefs(), []);
  const [format, setFormat] = useState<QuoteImageFormat>(initialPrefs.format);
  const [aspect, setAspect] = useState<QuoteImageAspect>(initialPrefs.aspect);
  const [palette, setPalette] = useState<QuoteImagePalette>(initialPrefs.palette);
  const [textAlign, setTextAlign] = useState<QuoteImageTextAlign>(initialPrefs.textAlign);
  const [includeLeadIn, setIncludeLeadIn] = useState(initialPrefs.includeLeadIn);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const shareSupported = useMemo(() => canShareFiles(), []);
  const copySupported = useMemo(() => {
    try {
      return (
        typeof navigator.clipboard?.write === "function" &&
        typeof ClipboardItem !== "undefined"
      );
    } catch {
      return false;
    }
  }, []);

  const leadInTexts = includeLeadIn && availableLeadIn.length > 0 ? availableLeadIn : [];

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

  function updateTextAlign(next: QuoteImageTextAlign) {
    setTextAlign(next);
    saveQuoteImagePrefs({ textAlign: next });
  }

  function updateIncludeLeadIn(next: boolean) {
    setIncludeLeadIn(next);
    saveQuoteImagePrefs({ includeLeadIn: next });
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
        textAlign,
        quoteText: resolvedQuote,
        nextText: resolvedNext,
        leadInTexts,
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
  }, [format, aspect, palette, textAlign, leadInTexts, resolvedQuote, resolvedNext, titleLabel, image]);

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
      textAlign,
      quoteText: resolvedQuote,
      nextText: resolvedNext,
      leadInTexts,
      titleLabel,
      image,
    });
    return canvasToPngBlob(canvas);
  }

  async function handleDownload() {
    setBusy(true);
    setError(null);
    setStatus(null);
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

  async function handleCopyImage() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const blob = await buildBlob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": Promise.resolve(blob) }),
      ]);
      setStatus("Copied image.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy image");
    }
    setBusy(false);
  }

  async function handleShare() {
    setBusy(true);
    setError(null);
    setStatus(null);
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

        <div className="quote-image-controls">
          <p className="quote-image-row-label" id="quote-image-captions-label">
            Captions
          </p>
          <div
            className="quote-image-formats"
            role="radiogroup"
            aria-labelledby="quote-image-captions-label"
          >
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
        </div>

        <div className="quote-image-controls">
          <p className="quote-image-row-label" id="quote-image-aspect-label">
            Aspect Ratio
          </p>
          <div
            className="quote-image-row quote-image-row-four"
            role="radiogroup"
            aria-labelledby="quote-image-aspect-label"
          >
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
        </div>

        <div className="quote-image-controls">
          <p className="quote-image-row-label" id="quote-image-palette-label">
            Palette
          </p>
          <div
            className="quote-image-row quote-image-row-four"
            role="radiogroup"
            aria-labelledby="quote-image-palette-label"
          >
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
        </div>

        <div className="quote-image-controls">
          <p className="quote-image-row-label" id="quote-image-align-label">
            Text position
          </p>
          <div
            className="quote-image-row"
            role="radiogroup"
            aria-labelledby="quote-image-align-label"
          >
            {TEXT_ALIGN_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`quote-image-chip${textAlign === option.id ? " is-active" : ""}`}
                role="radio"
                aria-checked={textAlign === option.id}
                onClick={() => updateTextAlign(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label
          className={`quote-image-leadin${availableLeadIn.length === 0 ? " is-disabled" : ""}`}
          title={
            availableLeadIn.length === 0
              ? "No previous lines in this beat"
              : "Same lead-in cues as Play / Chat (up to 4)"
          }
        >
          <input
            type="checkbox"
            checked={includeLeadIn && availableLeadIn.length > 0}
            disabled={availableLeadIn.length === 0}
            onChange={(event) => updateIncludeLeadIn(event.target.checked)}
          />
          <span>Include previous lines</span>
        </label>

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
          {copySupported ? (
            <button
              type="button"
              className="button ghost"
              disabled={busy || !previewUrl}
              onClick={() => void handleCopyImage()}
            >
              Copy image
            </button>
          ) : null}
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

        {status ? <p className="muted">{status}</p> : null}
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
