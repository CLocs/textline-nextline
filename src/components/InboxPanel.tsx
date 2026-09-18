import { useEffect, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { catalogLabel } from "../lib/content/libraryGroups";
import { fetchInbox, type InboxItem } from "../lib/inbox/api";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { PosterArt } from "./PosterArt";

type Props = {
  entries: CatalogEntry[];
  onPlay: (shareId: string) => void;
};

export function InboxPanel({ entries, onPlay }: Props) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  useEffect(() => {
    if (!apiReady) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchInbox().then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setItems(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady]);

  if (!apiReady) {
    return (
      <p className="muted">Inbox needs a signed-in account on the live API — not the Local Vite shortcut.</p>
    );
  }
  if (loading) return <p className="muted">Loading inbox…</p>;
  if (error) {
    return (
      <p className="feedback wrong" role="alert">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="empty">Nothing yet. Friends can send you a line from Curate.</p>;
  }

  return (
    <ul className="title-list">
      {items.map((item) => {
        const entry = byId.get(item.titleId);
        const name = entry ? catalogLabel(entry) : item.titleId;
        return (
          <li key={item.id}>
            <button type="button" className="title-card" onClick={() => onPlay(item.shareId)}>
              <PosterArt
                titleId={item.titleId}
                title={entry?.title ?? item.titleId}
                lineIndex={item.lineIndex}
                fallback="hide"
                className="title-card-still"
              />
              <span className="title-card-copy">
                <span className="title-card-name">{name}</span>
                <span className="title-card-meta">From {item.from.displayName}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
