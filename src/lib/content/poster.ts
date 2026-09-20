/** Static poster for a catalog title. Missing files 404; the UI hides the img. */
export function posterUrl(titleId: string): string {
  return `/posters/${titleId}.jpg`;
}

/** Quote still for a prompt line. Missing files 404; the UI falls back to the poster. */
export function stillUrl(titleId: string, lineIndex: number, cacheBust?: string | number): string {
  const path = `/stills/${titleId}/${lineIndex}.jpg`;
  return cacheBust == null || cacheBust === "" ? path : `${path}?r=${cacheBust}`;
}
