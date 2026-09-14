/** Static poster for a catalog title. Missing files 404; the UI hides the img. */
export function posterUrl(titleId: string): string {
  return `/posters/${titleId}.jpg`;
}
