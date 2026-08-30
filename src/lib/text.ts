/** Strip leading speaker dashes (`- dialogue`) — same rules as transcript_maker export. */
export function stripSpeakerDash(line: string): string {
  return line.replace(/^[-–—]\s+/, "");
}

/** Flatten a transcript block into one display line (newlines → spaces). */
export function formatBlockText(text: string): string {
  return text
    .split("\n")
    .map((line) => stripSpeakerDash(line.trim()))
    .filter(Boolean)
    .join(" ");
}
