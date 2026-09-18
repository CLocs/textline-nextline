import { useEffect, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { fetchInbox, type InboxItem } from "../lib/inbox/api";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { InboxLineCard } from "./InboxLineCard";

type Props = {
  entries: CatalogEntry[];
};

export function InboxPanel({ entries }: Props) {
  const [items, setItems] = useState<InboxItem[]>([]);
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
    <ul className="inbox-line-list">
      {items.map((item) => (
        <li key={item.id}>
          <InboxLineCard item={item} entries={entries} />
        </li>
      ))}
    </ul>
  );
}
