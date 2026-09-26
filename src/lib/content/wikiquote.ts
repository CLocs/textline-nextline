import { normalizeQuote } from "./titleMatch.js";

/**
 * Pull spoken lines from an English Wikiquote film page's wikitext.
 * The wording is only a match needle. Store our lineIndex, not their sentence.
 */

const MIN_QUOTE_CHARS = 16;

const SKIP_HEADING =
  /^(taglines|cast|external links|see also|references|notes|quotes about)\b/i;

const FILE_OPTIONS = new Set([
  "thumb",
  "thumbnail",
  "left",
  "right",
  "center",
  "none",
  "frameless",
  "frame",
  "border",
]);

export function wikiquotePageTitle(catalogTitle: string): string {
  return catalogTitle.replace(/\s*[\(\[]\d{4}[\)\]]\s*$/, "").trim();
}

export function extractWikiquoteQuotes(wikitext: string): string[] {
  const quotes: string[] = [];
  const seen = new Set<string>();
  for (const section of splitSections(wikitext)) {
    if (SKIP_HEADING.test(section.heading)) continue;
    for (const raw of quotesInSection(section.body)) {
      const text = cleanWikiQuote(raw);
      if (normalizeQuote(text).length < MIN_QUOTE_CHARS) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      quotes.push(text);
    }
  }
  return quotes;
}

function splitSections(wikitext: string): { heading: string; body: string }[] {
  const matches = [...wikitext.matchAll(/^(=+)\s*([^=\n]+?)\s*\1\s*$/gm)];
  if (matches.length === 0) return [{ heading: "", body: wikitext }];
  const sections: { heading: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? wikitext.length) : wikitext.length;
    sections.push({ heading: match[2]!.trim(), body: wikitext.slice(start, end) });
  }
  return sections;
}

function quotesInSection(body: string): string[] {
  const { captions, rest } = extractFileCaptions(body);
  const lines = rest
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*") || line.startsWith(":"))
    .map((line) => line.replace(/^[*:\s]+/, ""));
  return [...captions, ...lines];
}

function extractFileCaptions(text: string): { captions: string[]; rest: string } {
  const captions: string[] = [];
  let rest = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("[[File:", i);
    if (start < 0) {
      rest += text.slice(i);
      break;
    }
    rest += text.slice(i, start);
    const end = closeBrackets(text, start);
    const caption = fileCaption(text.slice(start, end));
    if (caption) captions.push(caption);
    i = end;
  }
  return { captions, rest };
}

function closeBrackets(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === "[" && text[i + 1] === "[") {
      depth += 1;
      i += 1;
      continue;
    }
    if (text[i] === "]" && text[i + 1] === "]") {
      depth -= 1;
      i += 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function fileCaption(block: string): string {
  const inner = block.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const parts = splitTopLevel(inner, "|").slice(1);
  const candidates = parts.filter((part) => {
    const token = part.trim().toLowerCase();
    if (!token) return false;
    if (FILE_OPTIONS.has(token)) return false;
    if (/^\d+\s*px$/.test(token)) return false;
    if (token.startsWith("upright")) return false;
    return true;
  });
  return candidates.at(-1)?.trim() ?? "";
}

function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === "[[" || pair === "{{") {
      depth += 1;
      buf += pair;
      i += 1;
      continue;
    }
    if ((pair === "]]" || pair === "}}") && depth > 0) {
      depth -= 1;
      buf += pair;
      i += 1;
      continue;
    }
    if (text[i] === sep && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += text[i];
  }
  parts.push(buf);
  return parts;
}

export function cleanWikiQuote(raw: string): string {
  let text = raw.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref[^>]*\/>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  text = replaceWikiLinks(text);
  text = text.replace(/'{2,}/g, "");
  text = text.replace(/\[[^\[\]]*\]/g, " ");
  text = text.replace(/^[A-Za-z][^:]{0,40}:\s+/, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function replaceWikiLinks(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("[[", i);
    if (start < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    const end = closeBrackets(text, start);
    const inner = text.slice(start + 2, Math.max(start + 2, end - 2));
    const parts = splitTopLevel(inner, "|");
    out += (parts.at(-1) ?? "").trim();
    i = end;
  }
  return out;
}
