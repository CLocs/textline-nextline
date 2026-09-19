import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { fetchInbox, type InboxItem, type ParallelInboxItem } from "../lib/inbox/api";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { InboxLineCard } from "./InboxLineCard";
import { ParallelInboxCard } from "./ParallelInboxCard";

type Props = {
  entries: CatalogEntry[];
};

export function InboxPanel({ entries }: Props) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [parallels, setParallels] = useState<ParallelInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();

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
      setItems(result.items);
      setParallels(result.parallels);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady]);

  const feed = useMemo(
    () =>
      [
        ...parallels.map((item) => ({ kind: "parallel" as const, at: item.createdAt, item })),
        ...items.map((item) => ({ kind: "line" as const, at: item.createdAt, item })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    [items, parallels],
  );

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
  if (feed.length === 0) {
    return <p className="empty">Nothing yet. Friends can send you a line from Curate, or a parallel from a pack.</p>;
  }

  return (
    <ul className="inbox-line-list">
      {feed.map((entry) =>
        entry.kind === "parallel" ? (
          <li key={`p-${entry.item.id}`}>
            <ParallelInboxCard item={entry.item} />
          </li>
        ) : (
          <li key={`l-${entry.item.id}`}>
            <InboxLineCard item={entry.item} entries={entries} />
          </li>
        ),
      )}
    </ul>
  );
}
