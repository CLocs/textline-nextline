/** Collapse a movie title for matching Letterboxd ↔ Readwise ↔ catalog. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[:\-–—_,.]/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\b(full )?transcripts?\b/g, " ")
    .replace(/\bscripts?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function letterboxdFilmKey(title: string, year: number | null): string {
  return `${title.trim().toLowerCase()}|${year ?? ""}`;
}

export function parseTitleYear(raw: string): { title: string; year: number | null } {
  const cleaned = raw
    .replace(/\.(srt|vtt|md)$/i, "")
    .replace(/\s+[–-]\s*full transcript$/i, "")
    .replace(/\s+[–-]\s*transcript$/i, "")
    .replace(/\s+transcript$/i, "")
    .trim();

  const paren = cleaned.match(/^(.*?)\s*[\(\[](\d{4})[\)\]](.*)$/);
  if (paren) {
    const rest = `${paren[1]} ${paren[3]}`.replace(/\s+/g, " ").trim();
    return { title: stripJunkSuffix(rest || paren[1]!.trim()), year: Number(paren[2]) };
  }

  const glued = cleaned.match(/^([A-Za-z][A-Za-z .']+)(\d{4})(?!\d)/);
  if (glued && glued[1]!.trim().length >= 3) {
    return { title: stripJunkSuffix(glued[1]!.trim()), year: Number(glued[2]) };
  }

  return { title: stripJunkSuffix(cleaned), year: null };
}

function stripJunkSuffix(title: string): string {
  return title
    .replace(/[-_.]en$/i, "")
    .replace(/(directors?cut|bluray|web|x264|x265|10bit|aac.*|yify|yts|sinners).*$/i, "")
    .replace(/[-_.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dialogue-ish text for highlight ↔ transcript line matching. */
export function normalizeQuote(text: string): string {
  return text
    .replace(/\[view highlight\]\([^)]*\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesLikelyMatch(
  a: { title: string; year: number | null },
  b: { title: string; year: number | null },
): boolean {
  if (a.year !== null && b.year !== null && a.year !== b.year) return false;
  const na = normalizeTitle(a.title);
  const nb = normalizeTitle(b.title);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}
