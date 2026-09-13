import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getPlayableLines } from "../lib/content/playable";

type Props = {
  entries: CatalogEntry[];
  onSelect: (entry: CatalogEntry) => void;
};

function dialogueLineCount(entry: CatalogEntry): number {
  const title = getTitle(entry.id);
  return title ? getPlayableLines(title).length : entry.lineCount;
}

export function LibraryScreen({ entries, onSelect }: Props) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>Pick a movie or an episode</h2>
        <p className="muted">Curated transcripts from your library.</p>
      </div>

      {entries.length === 0 ? (
        <p className="empty">No titles imported yet. Run <code>npm run import:all</code>.</p>
      ) : (
        <ul className="title-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="title-card" onClick={() => onSelect(entry)}>
                <span className="title-card-name">{entry.title}</span>
                <span className="title-card-meta">
                  {dialogueLineCount(entry)} lines
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
