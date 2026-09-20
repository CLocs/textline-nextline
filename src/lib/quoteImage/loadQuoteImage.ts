import { posterUrl, stillUrl } from "../content/poster";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Prefer line still, then title poster. Null if neither loads. */
export async function loadQuoteBackdrop(
  titleId: string,
  lineIndex: number,
): Promise<HTMLImageElement | null> {
  const still = await loadImage(stillUrl(titleId, lineIndex));
  if (still) return still;
  return loadImage(posterUrl(titleId));
}
