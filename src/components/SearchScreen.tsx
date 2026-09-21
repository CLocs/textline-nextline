import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { searchCatalog, type GlobalSearchResult } from "../lib/content/globalSearch";
import { isStarred, loadPopularStarsGlobal } from "../lib/stars/sync";

type Props = {
  entries: CatalogEntry[];
  onBack: () => void;
  onOpenTitle: (entry: CatalogEntry) => void;
  onOpenLine: (entry: CatalogEntry, lineIndex: number) => void;
};

type Mode = "popular" | "mine";

const DEBOUNCE_MS = 150;

export function SearchScreen({ entries, onBack, onOpenTitle, onOpenLine }: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState<Mode>("popular");
  const [popularCounts, setPopularCounts] = useState<Map<string, number>>(() => new Map());
  const [popularReady, setPopularReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const map = await loadPopularStarsGlobal(100);
      if (!cancelled) {
        setPopularCounts(map);
        setPopularReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const results: GlobalSearchResult = useMemo(
    () =>
      searchCatalog({
        query: debouncedQuery,
        mode,
        entries,
        popularCounts,
        isStarred: (titleId, lineIndex) => isStarred(titleId, lineIndex),
      }),
    [debouncedQuery, mode, entries, popularCounts],
  );

  const entryById = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const entry of entries) map.set(entry.id, entry);
    return map;
  }, [entries]);

  const emptyQuery = debouncedQuery.trim().length === 0;
  const noHits = results.titles.length === 0 && results.lines.length === 0;

  return (
    <section className="panel search-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Home
      </button>

      <div className="section-header">
        <h2>Search</h2>
        <p className="muted">Find a title or line across the catalog.</p>
      </div>

      <div className="search-toolbar">
        <label className="search-query">
          <span className="sr-only">Search catalog</span>
          <input
            type="search"
            placeholder="Quote or title…"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="search-mode" role="group" aria-label="Result ranking">
          <button
            type="button"
            className={`button ghost${mode === "popular" ? " search-mode-active" : ""}`}
            aria-pressed={mode === "popular"}
            onClick={() => setMode("popular")}
          >
            Popular
          </button>
          <button
            type="button"
            className={`button ghost${mode === "mine" ? " search-mode-active" : ""}`}
            aria-pressed={mode === "mine"}
            onClick={() => setMode("mine")}
          >
            Starred by me
          </button>
        </div>
      </div>

      {mode === "popular" && !popularReady ? (
        <p className="muted">Loading popular lines…</p>
      ) : null}

      {noHits ? (
        <p className="muted search-empty">
          {emptyQuery
            ? mode === "mine"
              ? "No starred lines yet."
              : "No popular lines yet — try a search."
            : "No matches."}
        </p>
      ) : (
        <div className="search-results">
          {results.titles.length > 0 ? (
            <div className="search-section">
              <h3 className="search-section-title">Titles</h3>
              <ul className="search-list">
                {results.titles.map((hit) => {
                  const entry = entryById.get(hit.titleId);
                  if (!entry) return null;
                  return (
                    <li key={hit.titleId}>
                      <button
                        type="button"
                        className="search-hit search-hit-title"
                        onClick={() => onOpenTitle(entry)}
                      >
                        <span className="search-hit-label">{hit.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {results.lines.length > 0 ? (
            <div className="search-section">
              <h3 className="search-section-title">
                {emptyQuery ? (mode === "mine" ? "Your stars" : "Most popular") : "Lines"}
              </h3>
              <ul className="search-list">
                {results.lines.map((hit) => {
                  const entry = entryById.get(hit.titleId);
                  if (!entry) return null;
                  return (
                    <li key={`${hit.titleId}:${hit.lineIndex}`}>
                      <button
                        type="button"
                        className="search-hit search-hit-line"
                        onClick={() => onOpenLine(entry, hit.lineIndex)}
                      >
                        <span className="search-hit-meta">
                          <span className="search-hit-label">{hit.label}</span>
                          {typeof hit.popularCount === "number" && hit.popularCount > 0 ? (
                            <span className="search-hit-count">{hit.popularCount}</span>
                          ) : null}
                        </span>
                        <span className="search-hit-text">{hit.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
