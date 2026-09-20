import { useEffect, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { catalogLabel } from "../lib/content/libraryGroups";
import { getLine } from "../lib/content/lines";
import {
  fetchDmThread,
  fetchGroupThread,
  markDmRead,
  markGroupRead,
  type DmMessage,
  type GroupMessage,
} from "../lib/chats/api";
import type { CatalogEntry } from "../types/content";
import { InboxLineCard } from "./InboxLineCard";
import { ChatQuoteActions } from "./ChatQuoteActions";
import type { InboxItem } from "../lib/inbox/api";

type Props = {
  mode: "dm" | "group";
  peerUserId?: string;
  peerName?: string;
  groupId?: string;
  groupName?: string;
  entries: CatalogEntry[];
  onBack: () => void;
};

function OutgoingPreview({
  titleId,
  lineIndex,
  label,
  fromLabel,
  receiptLabel,
}: {
  titleId: string;
  lineIndex: number;
  label: string;
  fromLabel: string;
  receiptLabel?: string | null;
}) {
  const title = getTitle(titleId);
  const text = title ? (getLine(title, lineIndex)?.text ?? "") : "";
  return (
    <article className="inbox-line-card chats-outgoing-card">
      <div className="chat-quote-header">
        <p className="inbox-line-from">
          {fromLabel}
          <span className="muted"> · {label}</span>
          {receiptLabel ? (
            <span className="chats-receipt muted" title="Opened the chat">
              {" "}
              · {receiptLabel}
            </span>
          ) : null}
        </p>
        <ChatQuoteActions titleId={titleId} lineIndex={lineIndex} lineText={text} />
      </div>
      <blockquote className="prompt-text">
        <p className="prompt-current">{text || `Line ${lineIndex + 1}`}</p>
      </blockquote>
    </article>
  );
}

function dmReceiptLabel(receipt: DmMessage["receipt"]): string | null {
  if (receipt === "read") return "Read";
  if (receipt === "sent") return "Sent";
  return null;
}

function groupReceiptLabel(youSent: boolean, sentCount: number, readCount: number): string | null {
  if (!youSent) return null;
  if (readCount <= 0) return "Sent";
  if (readCount >= sentCount) return "Read";
  return `Read ${readCount}/${sentCount}`;
}

function dmToInboxItem(message: DmMessage): InboxItem {
  return {
    id: message.id,
    shareId: message.shareId,
    titleId: message.titleId,
    lineIndex: message.lineIndex,
    from: message.from,
    createdAt: message.createdAt,
  };
}

function groupToInboxItem(message: GroupMessage): InboxItem | null {
  if (!message.inboxId) return null;
  return {
    id: message.inboxId,
    shareId: message.shareId,
    titleId: message.titleId,
    lineIndex: message.lineIndex,
    from: message.from,
    createdAt: message.createdAt,
  };
}

export function ChatThreadScreen({
  mode,
  peerUserId,
  peerName,
  groupId,
  groupName,
  entries,
  onBack,
}: Props) {
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [title, setTitle] = useState(peerName ?? groupName ?? "Chat");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      if (mode === "dm" && peerUserId) {
        const [thread, _read] = await Promise.all([
          fetchDmThread(peerUserId),
          markDmRead(peerUserId),
        ]);
        if (cancelled) return;
        setLoading(false);
        if ("error" in thread) {
          setError(thread.error);
          return;
        }
        setDmMessages(thread.messages);
        setTitle(peerName?.trim() || thread.peer.displayName);
        return;
      }
      if (mode === "group" && groupId) {
        const [thread, _read] = await Promise.all([
          fetchGroupThread(groupId),
          markGroupRead(groupId),
        ]);
        if (cancelled) return;
        setLoading(false);
        if ("error" in thread) {
          setError(thread.error);
          return;
        }
        setGroupMessages(thread.messages);
        setTitle(thread.name || groupName || "Group");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, peerUserId, peerName, groupId, groupName]);

  function entryLabel(titleId: string): string {
    const entry = entries.find((row) => row.id === titleId);
    return entry ? catalogLabel(entry) : titleId;
  }

  return (
    <section className="panel chats-thread-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Chats
      </button>
      <div className="section-header">
        <h2>{title}</h2>
        <p className="muted">
          {mode === "group"
            ? "Shared group chat — send lines from Curate or Play."
            : "Direct chat — send lines from Curate or Play."}
        </p>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="share-message">{error}</p> : null}

      {!loading && !error && mode === "dm" && dmMessages.length === 0 ? (
        <p className="muted">No messages yet. Send them a line from Curate.</p>
      ) : null}
      {!loading && !error && mode === "group" && groupMessages.length === 0 ? (
        <p className="muted">No messages yet. Send a line to this group from Curate.</p>
      ) : null}

      {mode === "dm" ? (
        <ul className="inbox-line-list chats-message-list">
          {dmMessages.map((message) => (
            <li key={message.id}>
              {message.playable ? (
                <InboxLineCard item={dmToInboxItem(message)} entries={entries} showQuoteActions />
              ) : (
                <OutgoingPreview
                  titleId={message.titleId}
                  lineIndex={message.lineIndex}
                  label={entryLabel(message.titleId)}
                  fromLabel="You sent"
                  receiptLabel={dmReceiptLabel(message.receipt)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="inbox-line-list chats-message-list">
          {groupMessages.map((message) => {
            const playable = groupToInboxItem(message);
            return (
              <li key={message.shareId}>
                {playable && message.playable ? (
                  <InboxLineCard item={playable} entries={entries} showQuoteActions />
                ) : (
                  <OutgoingPreview
                    titleId={message.titleId}
                    lineIndex={message.lineIndex}
                    label={entryLabel(message.titleId)}
                    fromLabel={
                      message.youSent
                        ? `You sent · ${message.sentCount} received`
                        : `${message.from.displayName} · ${message.sentCount} received`
                    }
                    receiptLabel={groupReceiptLabel(
                      message.youSent,
                      message.sentCount,
                      message.readCount,
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
