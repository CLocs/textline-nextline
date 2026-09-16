import { useEffect, useState } from "react";
import { posterUrl, stillUrl } from "../lib/content/poster";

type Props = {
  titleId: string;
  title: string;
  /** Mini-game prompt line: try `/stills/{id}/{n}.jpg`, then the poster. */
  lineIndex?: number;
  className?: string;
};

export function PosterArt({ titleId, title, lineIndex, className }: Props) {
  const poster = posterUrl(titleId);
  const still = lineIndex != null ? stillUrl(titleId, lineIndex) : null;
  const [src, setSrc] = useState(still ?? poster);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    setSrc(still ?? poster);
  }, [titleId, lineIndex, still, poster]);

  if (hidden) return null;

  const usingStill = Boolean(still) && src === still;
  return (
    <img
      className={className ?? "title-poster"}
      src={src}
      alt={usingStill ? `${title} still` : `${title} poster`}
      onError={() => {
        if (still && src === still) setSrc(poster);
        else setHidden(true);
      }}
    />
  );
}
