import { useState } from "react";
import { posterUrl } from "../lib/content/poster";

type Props = {
  titleId: string;
  title: string;
  className?: string;
};

export function PosterArt({ titleId, title, className }: Props) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <img
      className={className ?? "title-poster"}
      src={posterUrl(titleId)}
      alt={`${title} poster`}
      onError={() => setHidden(true)}
    />
  );
}
