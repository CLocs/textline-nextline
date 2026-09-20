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

function QuoteUnreadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.5 3.5h3.2v4.2c0 2.1-1.1 3.4-3.2 3.9V9.8c.9-.3 1.4-.9 1.4-2H3.5V3.5zm6 0h3.2v4.2c0 2.1-1.1 3.4-3.2 3.9V9.8c.9-.3 1.4-.9 1.4-2H9.5V3.5z"
      />
    </svg>
  );
}

function TextUnreadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.5 3.2h13v9.6h-13V3.2zm1.2 1.3 5.3 3.6 5.3-3.6v-.1H2.7zm0 1.5v5.5h10.6V6l-5.3 3.5L2.7 6z"
      />
    </svg>
  );
}

function DualUnreadBadges({
  quoteUnreadCount,
  textUnreadCount,
}: {
  quoteUnreadCount: number;
  textUnreadCount: number;
}) {
  if (quoteUnreadCount <= 0 && textUnreadCount <= 0) return null;
  return (
    <span className="chats-dual-unread">
      {quoteUnreadCount > 0 ? (
        <span className="chats-unread-chip" title={`${quoteUnreadCount} unread quotes`}>
          <QuoteUnreadIcon />
          {quoteUnreadCount}
        </span>
      ) : null}
      {textUnreadCount > 0 ? (
        <span className="chats-unread-chip is-text" title={`${textUnreadCount} unread messages`}>
          <TextUnreadIcon />
          {textUnreadCount}
        </span>
      ) : null}
    </span>
  );
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

    async function load(opts: { silent?: boolean } = {}) {
      if (!opts.silent) setLoading(true);
      const result = await fetchChats();
      if (cancelled) return;
      if (!opts.silent) setLoading(false);
      if ("error" in result) {
        if (!opts.silent) {
          setError(result.error);
          setThreads([]);
        }
        return;
      }
      setError(null);
      setThreads(compact ? result.slice(0, 8) : result);
    }

    void load();

    function poll() {
      if (document.visibilityState === "hidden") return;
      void load({ silent: true });
    }

    const intervalId = window.setInterval(poll, 8000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
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
        No chats yet. Send a line from Curate or open a thread and say hello.
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
                <DualUnreadBadges
                  quoteUnreadCount={thread.quoteUnreadCount}
                  textUnreadCount={thread.textUnreadCount}
                />
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
                <DualUnreadBadges
                  quoteUnreadCount={thread.quoteUnreadCount}
                  textUnreadCount={thread.textUnreadCount}
                />
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
