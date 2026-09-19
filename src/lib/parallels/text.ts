/** Join cue texts into one editable beat for rewrite parallels. */
export function concatenateCueTexts(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}
