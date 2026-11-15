import { useEffect, useRef, useState } from "react";
import { posterUrl, stillUrl } from "../lib/content/poster";

type Props = {
  titleId: string;
  title: string;
  /** Mini-game prompt line, or a library cover index. */
  lineIndex?: number;
  /** Play/setup fall back to the one-sheet. Library thumbs hide instead. */
  fallback?: "poster" | "hide";
  className?: string;
  /** Fetch only once the frame is near its scrollport. */
  lazy?: boolean;
};

/** Preload a little past the list edge so a slow scroll meets a picture already in flight. */
const NEAR_VIEW_PX = 320;

function scrollParent(node: HTMLElement): Element | null {
  let parent = node.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "overlay") return parent;
    parent = parent.parentElement;
  }
  return null;
}

export function PosterArt({
  titleId,
  title,
  lineIndex,
  fallback = "poster",
  className,
  lazy = false,
}: Props) {
  const poster = posterUrl(titleId);
  const hidePoster = fallback === "hide";
  const frameRef = useRef<HTMLSpanElement>(null);
  const [stillBust, setStillBust] = useState<number | null>(null);
  const [ready, setReady] = useState(!lazy);
  const [override, setOverride] = useState<"poster" | "hidden" | null>(null);

  useEffect(() => {
    setStillBust(null);
    setOverride(null);
  }, [titleId, lineIndex]);

  useEffect(() => {
    if (!lazy) {
      setReady(true);
      return;
    }
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setReady(true);
        observer.disconnect();
      },
      { root: scrollParent(node), rootMargin: `${NEAR_VIEW_PX}px 0px`, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, titleId, lineIndex]);

  const still =
    ready && lineIndex != null ? stillUrl(titleId, lineIndex, stillBust ?? undefined) : null;
  let src: string | null = still ?? (hidePoster ? null : poster);
  if (!ready || override === "hidden") src = null;
  else if (override === "poster") src = poster;

  const frameClass = className ?? "title-poster";
  if (!ready) {
    return <span ref={frameRef} className={frameClass} aria-hidden="true" />;
  }
  if (!src) return null;

  const usingStill = Boolean(still) && src === still;
  return (
    <img
      className={frameClass}
      src={src}
      alt={usingStill ? `${title} still` : `${title} poster`}
      decoding={lazy ? "async" : undefined}
      onError={() => {
        // Curate already waits for the row to come near. A second cache-bust request
        // just doubles every missing still while the list is scrolling.
        if (!lazy && still && src === still && stillBust == null) {
          setStillBust(Date.now());
          return;
        }
        if (!hidePoster && still && src === still) setOverride("poster");
        else setOverride("hidden");
      }}
    />
  );
}
