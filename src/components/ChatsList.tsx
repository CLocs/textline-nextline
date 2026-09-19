import { useEffect, useState } from "react";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { fetchChats, type ChatThreadSummary } from "../lib/chats/api";

type Props = {
  onOpenDm: (peerUserId: string, displayName: string) => void;
  onOpenGroup: (groupId: string, name: string) => void;
  compact?: boolean;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatsList({ onOpenDm, onOpenGroup, compact = false }: Props) {
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(apiReady);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiReady) {
      setThreads([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchChats().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        setThreads([]);
        return;
      }
      setError(null);
      setThreads(compact ? result.slice(0, 8) : result);
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady, compact]);

  if (!apiReady) {
    return <p className="muted">Sign in to see chats with friends and groups.</p>;
  }
  if (loading) return <p className="muted">Loading chats…</p>;
  if (error) return <p className="share-message">{error}</p>;
  if (threads.length === 0) {
    return (
      <p className="muted">
        No chats yet. Send a line from Curate to a friend or group to start a thread.
      </p>
    );
  }

  return (
    <ul className="chats-thread-list">
      {threads.map((thread) =>
        thread.kind === "dm" ? (
          <li key={`dm-${thread.peerUserId}`}>
            <button
              type="button"
              className={`chats-thread-row${thread.unreadCount > 0 ? " has-unread" : ""}`}
              onClick={() => onOpenDm(thread.peerUserId, thread.displayName)}
            >
              <span className="chats-thread-avatar" aria-hidden="true">
                {thread.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="chats-thread-copy">
                <span className="chats-thread-name">{thread.displayName}</span>
                <span className="muted chats-thread-preview">{thread.lastPreview}</span>
              </span>
              <span className="chats-thread-meta">
                <span className="muted">{formatWhen(thread.lastAt)}</span>
                {thread.unreadCount > 0 ? (
                  <span className="chats-unread-badge">{thread.unreadCount}</span>
                ) : null}
              </span>
            </button>
          </li>
        ) : (
          <li key={`g-${thread.groupId}`}>
            <button
              type="button"
              className={`chats-thread-row is-group${thread.unreadCount > 0 ? " has-unread" : ""}`}
              onClick={() => onOpenGroup(thread.groupId, thread.name)}
            >
              <span className="chats-thread-avatar is-group" aria-hidden="true">
                #
              </span>
              <span className="chats-thread-copy">
                <span className="chats-thread-name">
                  {thread.name}
                  <span className="chats-group-tag">Group · {thread.memberCount}</span>
                </span>
                <span className="muted chats-thread-preview">{thread.lastPreview}</span>
              </span>
              <span className="chats-thread-meta">
                <span className="muted">{formatWhen(thread.lastAt)}</span>
                {thread.unreadCount > 0 ? (
                  <span className="chats-unread-badge">{thread.unreadCount}</span>
                ) : null}
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
