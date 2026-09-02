import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { countPlayableQuestions } from "../lib/content/playable";

type Props = {
  entries: CatalogEntry[];
  onSelect: (entry: CatalogEntry) => void;
};

function dialogueQuestionCount(entry: CatalogEntry): number | null {
  const title = getTitle(entry.id);
  return title ? countPlayableQuestions(title) : null;
}

export function LibraryScreen({ entries, onSelect }: Props) {
  return (
    <section className="panel">
      <div className="section-header">
        <h2>Pick an episode</h2>
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
                  {dialogueQuestionCount(entry) ?? entry.lineCount} questions
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
