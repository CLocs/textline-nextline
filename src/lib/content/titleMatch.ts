/** Collapse a movie title for matching Letterboxd ↔ Readwise ↔ catalog. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[:\-–—_,.?!'"]/g, " ")
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
  const na = foldNumberWords(normalizeTitle(a.title));
  const nb = foldNumberWords(normalizeTitle(b.title));
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

/**
 * When several titles substring-match a Readwise note (Star Wars vs Empire),
 * keep the longest specific title contained in the note.
 */
export function pickBestTitleMatch<T extends { title: string; year: number | null }>(
  query: { title: string; year: number | null },
  candidates: T[],
): T | null {
  const hits = candidates.filter((candidate) => titlesLikelyMatch(query, candidate));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;

  const q = foldNumberWords(normalizeTitle(query.title));
  const scored = hits
    .map((candidate) => {
      const n = foldNumberWords(normalizeTitle(candidate.title));
      let score = 0;
      if (q === n) score = 1_000_000 + n.length;
      else if (q.includes(n)) score = n.length;
      else if (n.includes(q)) score = q.length;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score === 0) return null;
  if (second && second.score === best.score) return null;
  return best.candidate;
}

export type EpisodeHint = {
  show: string | null;
  season: number;
  episode: number;
  episodeTitle: string | null;
};

/** `Show - 5x10 - Name` or `Show (1989–…): Season 5, Episode 10 - Name`. */
export function parseEpisodeHint(raw: string): EpisodeHint | null {
  const cleaned = raw
    .replace(/\s+[–-]\s*full transcript$/i, "")
    .replace(/\s+transcript$/i, "")
    .trim();

  const compact = cleaned.match(/^(.*?)\s+-\s+(\d{1,2})x(\d{1,3})(?:\s+-\s+(.+))?$/i);
  if (compact) {
    return {
      show: compact[1]!.trim() || null,
      season: Number(compact[2]),
      episode: Number(compact[3]),
      episodeTitle: compact[4]?.trim() || null,
    };
  }

  const long = cleaned.match(
    /^(.*?)\s*(?:\([^)]*\))?\s*[:\-]?\s*Season\s+(\d+)\s*,\s*Episode\s+(\d+)\s*[-–—:]?\s*(.*)$/i,
  );
  if (long) {
    let episodeTitle = long[4]?.trim() || null;
    if (episodeTitle) {
      const cut = episodeTitle.replace(/\s*\(.*\)$/, "").trim();
      if (cut) episodeTitle = cut;
    }
    return {
      show: long[1]!.trim() || null,
      season: Number(long[2]),
      episode: Number(long[3]),
      episodeTitle,
    };
  }

  return null;
}

/** Ocean's 11 ↔ Ocean's Eleven (and 8/13) after punctuation is stripped. */
export function foldNumberWords(title: string): string {
  return title
    .replace(/\bthirteen\b/g, "13")
    .replace(/\beleven\b/g, "11")
    .replace(/\beight\b/g, "8");
}
