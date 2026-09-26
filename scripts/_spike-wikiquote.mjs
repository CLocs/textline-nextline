import { readFileSync } from "node:fs";

function stripWiki(s) {
  return s
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'{2,3}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\*+\s*/, "")
    .replace(/^:+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function quotesFrom(wt) {
  const out = [];
  for (const raw of wt.split("\n")) {
    if (!/^[:*]/.test(raw)) continue;
    const text = stripWiki(raw);
    if (text.length < 24) continue;
    out.push(text);
  }
  return out;
}

const films = [
  ["Pulp Fiction", "content/titles/pulp-fiction-1994.json"],
  ["Goodfellas", "content/titles/goodfellas-1990.json"],
  ["The Big Lebowski", "content/titles/the-big-lebowski-1998.json"],
];

for (const [page, file] of films) {
  const url =
    "https://en.wikiquote.org/w/api.php?action=parse&page=" +
    encodeURIComponent(page) +
    "&prop=wikitext&format=json&redirects=1";
  const res = await fetch(url, {
    headers: { "User-Agent": "textline-nextline-spike/0.1 (personal research)" },
  });
  const json = await res.json();
  const wt = json.parse.wikitext["*"];
  const quotes = quotesFrom(wt);
  const title = JSON.parse(readFileSync(file, "utf8"));
  const lines = title.lines.map((l) => ({ index: l.index, c: compact(l.text), text: l.text }));
  let exact = 0;
  let contains = 0;
  let miss = 0;
  const samples = [];
  const misses = [];
  for (const q of quotes) {
    const n = compact(q);
    if (n.length < 16) continue;
    const hitLine = lines.find(
      (l) =>
        l.c === n ||
        (n.length >= 20 && l.c.includes(n)) ||
        (l.c.length >= 24 && n.includes(l.c)),
    );
    if (hitLine) {
      if (hitLine.c === n) exact += 1;
      else contains += 1;
      if (samples.length < 2) samples.push(q.slice(0, 100));
    } else {
      miss += 1;
      if (misses.length < 2) misses.push(q.slice(0, 100));
    }
  }
  const considered = exact + contains + miss;
  const rate = considered ? Math.round(((exact + contains) / considered) * 100) : 0;
  console.log(
    JSON.stringify({
      page,
      quotes: quotes.length,
      considered,
      exact,
      contains,
      miss,
      lineHitPct: rate,
    }),
  );
  for (const s of samples) console.log("  HIT", s);
  for (const s of misses) console.log("  MISS", s);
}
