import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCatalog, getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import {
  fetchParallelPack,
  proposeParallelConnection,
  upvoteParallelConnection,
  type AnalogyConnection,
  type AnalogyPack,
} from "../lib/parallels/api";

type Props = {
  packId: string;
  onPlay: (shareId: string) => void;
  onBack: () => void;
};

function formatLines(titleId: string, indices: number[]): string[] {
  const title = getTitle(titleId);
  if (!title) return indices.map((i) => `Line ${i + 1}`);
  return indices.map((i) => {
    const line = getLine(title, i);
    return line?.text ?? `Line ${i + 1}`;
  });
}

export function ParallelPackScreen({ packId, onPlay, onBack }: Props) {
  const [pack, setPack] = useState<AnalogyPack | null>(null);
  const [connections, setConnections] = useState<AnalogyConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connTitleId, setConnTitleId] = useState("");
  const [connIndices, setConnIndices] = useState("");
  const [connNote, setConnNote] = useState("");
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);

  const catalog = useMemo(() => getCatalog().titles, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchParallelPack(packId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        setPack(null);
        setConnections([]);
        return;
      }
      setError(null);
      setPack(result.pack);
      setConnections(result.connections);
      if (!connTitleId && result.pack.titleId) setConnTitleId(result.pack.titleId);
    });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  const packLines = useMemo(
    () => (pack ? formatLines(pack.titleId, pack.lineIndices) : []),
    [pack],
  );

  async function handlePropose(event: FormEvent) {
    event.preventDefault();
    if (!pack) return;
    setProposeBusy(true);
    setProposeMsg(null);
    const lineIndices = connIndices
      .split(/[\s,]+/)
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
    const result = await proposeParallelConnection(pack.id, {
      titleId: connTitleId.trim(),
      lineIndices,
      note: connNote.trim() || undefined,
    });
    setProposeBusy(false);
    if ("error" in result) {
      setProposeMsg(result.error);
      return;
    }
    setConnections((prev) => [result, ...prev]);
    setConnIndices("");
    setConnNote("");
    setProposeMsg("Parallel added.");
  }

  async function handleUpvote(connectionId: string) {
    const result = await upvoteParallelConnection(connectionId);
    if ("error" in result) {
      setProposeMsg(result.error);
      return;
    }
    setConnections((prev) =>
      [...prev]
        .map((c) =>
          c.id === connectionId
            ? { ...c, score: result.score, viewerVoted: true }
            : c,
        )
        .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)),
    );
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">Loading parallel pack…</p>
      </section>
    );
  }

  if (error || !pack) {
    return (
      <section className="panel">
        <button type="button" className="button ghost back-link" onClick={onBack}>
          ← Home
        </button>
        <p className="empty">{error ?? "Pack not found."}</p>
      </section>
    );
  }

  const entry = catalog.find((e) => e.id === pack.titleId);

  return (
    <section className="panel parallel-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Home
      </button>

      <div className="section-header">
        <h2>{pack.name}</h2>
        <p className="muted">
          {entry?.title ?? pack.titleId} · by {pack.ownerDisplayName}
        </p>
      </div>

      <ol className="parallel-lines">
        {packLines.map((text, i) => (
          <li key={pack.lineIndices[i]}>
            <span className="muted">L{pack.lineIndices[i]! + 1}</span> {text}
          </li>
        ))}
      </ol>

      <div className="row">
        <button type="button" className="button primary" onClick={() => onPlay(pack.shareId)}>
          Play this pack
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            const url = `${window.location.origin}/#/parallel/${pack.id}`;
            void navigator.clipboard.writeText(url);
            setProposeMsg("Pack link copied.");
          }}
        >
          Copy pack link
        </button>
      </div>

      <h3 className="parallel-section-title">Parallels</h3>
      <p className="muted">
        Catalog connections only (Light). Upvote good analogies. Chat and URLs come later.
      </p>

      {connections.length === 0 ? (
        <p className="empty">No parallels yet. Propose one below.</p>
      ) : (
        <ul className="parallel-conn-list">
          {connections.map((conn) => {
            const connEntry = catalog.find((e) => e.id === conn.payload.titleId);
            const texts = formatLines(conn.payload.titleId, conn.payload.lineIndices);
            return (
              <li key={conn.id} className="parallel-conn">
                <div className="parallel-conn-head">
                  <strong>{connEntry?.title ?? conn.payload.titleId}</strong>
                  <span className="muted">
                    {conn.score} ↑ · {conn.proposerDisplayName}
                  </span>
                </div>
                {conn.note && <p className="parallel-conn-note">{conn.note}</p>}
                <ul className="parallel-conn-lines">
                  {texts.map((text, i) => (
                    <li key={conn.payload.lineIndices[i]}>
                      <span className="muted">L{conn.payload.lineIndices[i]! + 1}</span> {text}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="button ghost"
                  disabled={conn.viewerVoted}
                  onClick={() => void handleUpvote(conn.id)}
                >
                  {conn.viewerVoted ? "Upvoted" : "Upvote"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form className="parallel-propose" onSubmit={(event) => void handlePropose(event)}>
        <h3 className="parallel-section-title">Propose a parallel</h3>
        <label>
          <span>Title</span>
          <select value={connTitleId} onChange={(e) => setConnTitleId(e.target.value)} required>
            <option value="">Pick a title…</option>
            {catalog.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Line indices (0-based, comma-separated)</span>
          <input
            type="text"
            value={connIndices}
            onChange={(e) => setConnIndices(e.target.value)}
            placeholder="e.g. 1008 or 541,554,555"
            required
          />
        </label>
        <label>
          <span>Note (optional)</span>
          <input
            type="text"
            maxLength={140}
            value={connNote}
            onChange={(e) => setConnNote(e.target.value)}
            placeholder="Same energy / punchline…"
          />
        </label>
        <button type="submit" className="button primary" disabled={proposeBusy}>
          {proposeBusy ? "Saving…" : "Propose"}
        </button>
      </form>

      {proposeMsg && (
        <p className="share-message" role="status">
          {proposeMsg}
        </p>
      )}
    </section>
  );
}
