import { useEffect, useState } from "react";
import { posterUrl, stillUrl } from "../lib/content/poster";

type Props = {
  titleId: string;
  title: string;
  /** Mini-game prompt line, or a library cover index. */
  lineIndex?: number;
  /** Play/setup fall back to the one-sheet. Library thumbs hide instead. */
  fallback?: "poster" | "hide";
  className?: string;
};

export function PosterArt({
  titleId,
  title,
  lineIndex,
  fallback = "poster",
  className,
}: Props) {
  const poster = posterUrl(titleId);
  const still = lineIndex != null ? stillUrl(titleId, lineIndex) : null;
  const hidePoster = fallback === "hide";
  const initial = still ?? (hidePoster ? null : poster);
  const [src, setSrc] = useState<string | null>(initial);
  const [hidden, setHidden] = useState(!initial);

  useEffect(() => {
    const next = still ?? (hidePoster ? null : poster);
    setHidden(!next);
    setSrc(next);
  }, [titleId, lineIndex, still, poster, hidePoster]);

  if (hidden || !src) return null;

  const usingStill = Boolean(still) && src === still;
  return (
    <img
      className={className ?? "title-poster"}
      src={src}
      alt={usingStill ? `${title} still` : `${title} poster`}
      onError={() => {
        if (!hidePoster && still && src === still) setSrc(poster);
        else setHidden(true);
      }}
    />
  );
}
