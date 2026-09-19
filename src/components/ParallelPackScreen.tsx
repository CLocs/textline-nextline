import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCatalog, getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { fetchFriends, type FriendListItem } from "../lib/friends/api";
import { fetchGroups, type FriendGroup } from "../lib/groups/api";
import {
  fetchParallelPack,
  proposeParallelConnection,
  upvoteParallelConnection,
  type AnalogyConnection,
  type AnalogyPack,
} from "../lib/parallels/api";
import { concatenateCueTexts } from "../lib/parallels/text";

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
  const [composing, setComposing] = useState(false);
  const [connContext, setConnContext] = useState("");
  const [connText, setConnText] = useState("");
  const [connTitleId, setConnTitleId] = useState("");
  const [connIndices, setConnIndices] = useState("");
  const [connNote, setConnNote] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [toUserIds, setToUserIds] = useState<string[]>([]);
  const [toGroupIds, setToGroupIds] = useState<string[]>([]);
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);

  const catalog = useMemo(() => getCatalog().titles, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setComposing(false);
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
    });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  const packLines = useMemo(
    () => (pack ? formatLines(pack.titleId, pack.lineIndices) : []),
    [pack],
  );
  const concatenated = useMemo(() => concatenateCueTexts(packLines), [packLines]);
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();

  useEffect(() => {
    if (!composing || !apiReady) return;
    let cancelled = false;
    void Promise.all([fetchFriends(), fetchGroups()]).then(([list, groupList]) => {
      if (cancelled) return;
      if (!("error" in list)) setFriends(list);
      if (!("error" in groupList)) setGroups(groupList);
    });
    return () => {
      cancelled = true;
    };
  }, [composing, apiReady]);

  function openCompose() {
    setProposeMsg(null);
    setConnContext("");
    setConnText(concatenated);
    setToUserIds([]);
    setToGroupIds([]);
    setComposing(true);
  }

  async function handleRewrite(event: FormEvent) {
    event.preventDefault();
    if (!pack) return;
    setProposeBusy(true);
    setProposeMsg(null);
    const result = await proposeParallelConnection(pack.id, {
      kind: "rewrite",
      context: connContext.trim(),
      text: connText.trim(),
      toUserIds,
      toGroupIds,
    });
    setProposeBusy(false);
    if ("error" in result) {
      setProposeMsg(result.error);
      return;
    }
    setConnections((prev) => [result, ...prev]);
    setComposing(false);
    setConnContext("");
    setProposeMsg("Parallel added.");
  }

  async function handleCatalogPropose(event: FormEvent) {
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
          c.id === connectionId ? { ...c, score: result.score, viewerVoted: true } : c,
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

  if (composing) {
    return (
      <section className="panel parallel-panel">
        <button type="button" className="button ghost back-link" onClick={() => setComposing(false)}>
          ← Pack
        </button>
        <div className="section-header">
          <h2>Add a parallel</h2>
          <p className="muted">
            Start from the scene, then swap in your situation. Short context labels the rewrite.
          </p>
        </div>
        <form className="parallel-propose parallel-compose" onSubmit={(event) => void handleRewrite(event)}>
          <label>
            <span>Context</span>
            <input
              type="text"
              maxLength={80}
              value={connContext}
              onChange={(e) => setConnContext(e.target.value)}
              placeholder="e.g. new features"
              required
            />
          </label>
          <label>
            <span>Parallel</span>
            <textarea
              value={connText}
              onChange={(e) => setConnText(e.target.value)}
              maxLength={12000}
              rows={12}
              required
            />
          </label>
          <fieldset className="parallel-send-to">
            <legend>Send to</legend>
            {!apiReady ? (
              <p className="muted">Sign in on the live API to send this to a friend or group.</p>
            ) : friends.length === 0 && groups.length === 0 ? (
              <p className="muted">No friends yet. Add someone in Profile → Friends.</p>
            ) : (
              <>
                {groups.length > 0 && (
                  <div className="parallel-send-list">
                    {groups.map((group) => (
                      <label key={group.id} className="curate-filter">
                        <input
                          type="checkbox"
                          checked={toGroupIds.includes(group.id)}
                          onChange={() =>
                            setToGroupIds((current) =>
                              current.includes(group.id)
                                ? current.filter((id) => id !== group.id)
                                : [...current, group.id],
                            )
                          }
                        />
                        {group.name}
                      </label>
                    ))}
                  </div>
                )}
                {friends.length > 0 && (
                  <div className="parallel-send-list">
                    {friends.map((friend) => (
                      <label key={friend.userId} className="curate-filter">
                        <input
                          type="checkbox"
                          checked={toUserIds.includes(friend.userId)}
                          onChange={() =>
                            setToUserIds((current) =>
                              current.includes(friend.userId)
                                ? current.filter((id) => id !== friend.userId)
                                : [...current, friend.userId],
                            )
                          }
                        />
                        {friend.displayName}
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </fieldset>
          <div className="row">
            <button type="submit" className="button primary" disabled={proposeBusy}>
              {proposeBusy ? "Saving…" : "Save parallel"}
            </button>
            <button type="button" className="button ghost" onClick={() => setComposing(false)}>
              Cancel
            </button>
          </div>
        </form>
        {proposeMsg && (
          <p className="share-message" role="status">
            {proposeMsg}
          </p>
        )}
      </section>
    );
  }

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
        <button type="button" className="button ghost" onClick={openCompose}>
          Add a parallel
        </button>
      </div>

      <h3 className="parallel-section-title">Parallels</h3>
      <p className="muted">Rewrite the beat in a new context, or link another title. Upvote the good ones.</p>

      {connections.length === 0 ? (
        <p className="empty">No parallels yet. Add one to rewrite this scene.</p>
      ) : (
        <ul className="parallel-conn-list">
          {connections.map((conn) => {
            if (conn.kind === "rewrite") {
              return (
                <li key={conn.id} className="parallel-conn">
                  <div className="parallel-conn-head">
                    <strong>{conn.payload.context}</strong>
                    <span className="muted">
                      {conn.score} ↑ · {conn.proposerDisplayName}
                    </span>
                  </div>
                  <p className="parallel-conn-text">{conn.payload.text}</p>
                  {conn.payload.sentTo && (
                    <p className="muted parallel-sent-to">
                      Sent to{" "}
                      {[
                        ...conn.payload.sentTo.groups.map((group) => group.name),
                        ...conn.payload.sentTo.people.map((person) => person.displayName),
                      ].join(", ")}
                    </p>
                  )}
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
            }

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

      <details
        className="parallel-catalog-details"
        open={showCatalog}
        onToggle={(event) => setShowCatalog(event.currentTarget.open)}
      >
        <summary>From another title</summary>
        <form className="parallel-propose" onSubmit={(event) => void handleCatalogPropose(event)}>
          <label>
            <span>Title</span>
            <select value={connTitleId} onChange={(e) => setConnTitleId(e.target.value)}>
              <option value="">[none]</option>
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
              disabled={!connTitleId}
              required={Boolean(connTitleId)}
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
          <button type="submit" className="button primary" disabled={proposeBusy || !connTitleId}>
            {proposeBusy ? "Saving…" : "Propose catalog parallel"}
          </button>
        </form>
      </details>

      {proposeMsg && (
        <p className="share-message" role="status">
          {proposeMsg}
        </p>
      )}
    </section>
  );
}
