/** Static poster for a catalog title. Missing files 404; the UI hides the img. */
export function posterUrl(titleId: string): string {
  return `/posters/${titleId}.jpg`;
}

/** Quote still for a prompt line. Missing files 404; the UI falls back to the poster. */
export function stillUrl(titleId: string, lineIndex: number): string {
  return `/stills/${titleId}/${lineIndex}.jpg`;
}
