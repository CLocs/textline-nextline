import { useEffect, useRef, useState, type FormEvent, type UIEvent } from "react";
import { getTitle } from "../lib/content/browser";
import { catalogLabel } from "../lib/content/libraryGroups";
import { getLine } from "../lib/content/lines";
import { getNextPlayableLine } from "../lib/content/playable";
import { leadInForPrompt } from "../lib/game/promptContext";
import {
  fetchDmThread,
  fetchGroupThread,
  markDmRead,
  markGroupRead,
  postDmChatMessage,
  postGroupChatMessage,
  type ChatReaction,
  type DmQuoteMessage,
  type DmThreadMessage,
  type GroupQuoteMessage,
  type GroupThreadMessage,
} from "../lib/chats/api";
import type { CatalogEntry } from "../types/content";
import { InboxLineCard } from "./InboxLineCard";
import { ChatQuoteActions } from "./ChatQuoteActions";
import { ChatReactions } from "./ChatReactions";
import type { InboxItem } from "../lib/inbox/api";

const NEAR_BOTTOM_PX = 96;
const THREAD_POLL_MS = 4000;

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
  answeredLabel,
  shareId,
  reactions,
  peerUserId,
  groupId,
  onReactions,
}: {
  titleId: string;
  lineIndex: number;
  label: string;
  fromLabel: string;
  receiptLabel?: string | null;
  answeredLabel?: string | null;
  shareId: string;
  reactions: ChatReaction[];
  peerUserId?: string;
  groupId?: string;
  onReactions: (reactions: ChatReaction[]) => void;
}) {
  const title = getTitle(titleId);
  const promptText = title ? (getLine(title, lineIndex)?.text ?? "") : "";
  const leadIn = title ? leadInForPrompt(title, lineIndex) : [];
  const nextText = title ? (getNextPlayableLine(title, lineIndex)?.text ?? "") : "";

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
          {answeredLabel ? (
            <span className="chats-answered" title="Got the next line">
              {" "}
              · {answeredLabel}
            </span>
          ) : null}
        </p>
        <ChatQuoteActions titleId={titleId} lineIndex={lineIndex} lineText={promptText} />
      </div>
      <blockquote className="prompt-text inbox-line-pair">
        {leadIn.map((line) => (
          <p key={line.lineIndex} className="prompt-lead-in">
            {line.text}
          </p>
        ))}
        <p className="prompt-current">{promptText || `Line ${lineIndex + 1}`}</p>
        {nextText ? <p className="inbox-nextline">{nextText}</p> : null}
      </blockquote>
      <ChatReactions
        targetKind="quote"
        targetId={shareId}
        reactions={reactions}
        peerUserId={peerUserId}
        groupId={groupId}
        onReactions={onReactions}
      />
    </article>
  );
}

function TextBubble({
  body,
  fromLabel,
  youSent,
  messageId,
  reactions,
  peerUserId,
  groupId,
  onReactions,
}: {
  body: string;
  fromLabel: string;
  youSent: boolean;
  messageId: string;
  reactions: ChatReaction[];
  peerUserId?: string;
  groupId?: string;
  onReactions: (reactions: ChatReaction[]) => void;
}) {
  return (
    <article className={`chats-text-bubble${youSent ? " is-out" : " is-in"}`}>
      <p className="chats-text-from muted">{fromLabel}</p>
      <p className="chats-text-body">{body}</p>
      <ChatReactions
        targetKind="text"
        targetId={messageId}
        reactions={reactions}
        peerUserId={peerUserId}
        groupId={groupId}
        onReactions={onReactions}
      />
    </article>
  );
}

function dmReceiptLabel(receipt: DmQuoteMessage["receipt"]): string | null {
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

function groupAnsweredLabel(youSent: boolean, answeredCount: number, sentCount: number): string | null {
  if (!youSent || answeredCount <= 0) return null;
  if (answeredCount >= sentCount) return "Correct";
  return `Correct ${answeredCount}/${sentCount}`;
}

function dmToInboxItem(message: DmQuoteMessage): InboxItem {
  return {
    id: message.id,
    shareId: message.shareId,
    titleId: message.titleId,
    lineIndex: message.lineIndex,
    from: message.from,
    createdAt: message.createdAt,
  };
}

function groupToInboxItem(message: GroupQuoteMessage): InboxItem | null {
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
  const [dmMessages, setDmMessages] = useState<DmThreadMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupThreadMessage[]>([]);
  const [title, setTitle] = useState(peerName ?? groupName ?? "Chat");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [quotesOnly, setQuotesOnly] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function handleThreadScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance <= NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    setShowJumpLatest(!nearBottom);
  }

  useEffect(() => {
    let cancelled = false;
    stickToBottomRef.current = true;
    setShowJumpLatest(false);

    async function load(opts: { silent?: boolean } = {}) {
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }
      if (mode === "dm" && peerUserId) {
        const [thread, _read] = await Promise.all([
          fetchDmThread(peerUserId),
          markDmRead(peerUserId),
        ]);
        if (cancelled) return;
        if (!opts.silent) setLoading(false);
        if ("error" in thread) {
          if (!opts.silent) setError(thread.error);
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
        if (!opts.silent) setLoading(false);
        if ("error" in thread) {
          if (!opts.silent) setError(thread.error);
          return;
        }
        setGroupMessages(thread.messages);
        setTitle(thread.name || groupName || "Group");
      }
    }

    void load();

    function poll() {
      if (document.visibilityState === "hidden") return;
      void load({ silent: true });
    }

    const intervalId = window.setInterval(poll, THREAD_POLL_MS);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [mode, peerUserId, peerName, groupId, groupName]);

  const messageCount = mode === "dm" ? dmMessages.length : groupMessages.length;

  useEffect(() => {
    if (loading || error) return;
    if (!stickToBottomRef.current) {
      setShowJumpLatest(true);
      return;
    }
    // Instant on first paint / when pinned so open lands on latest.
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      setShowJumpLatest(false);
    });
  }, [loading, error, messageCount]);

  function entryLabel(titleId: string): string {
    const entry = entries.find((row) => row.id === titleId);
    return entry ? catalogLabel(entry) : titleId;
  }

  function setDmReactions(targetKind: "text" | "quote", targetId: string, reactions: ChatReaction[]) {
    setDmMessages((prev) =>
      prev.map((message) => {
        if (targetKind === "text" && message.kind === "text" && message.id === targetId) {
          return { ...message, reactions };
        }
        if (targetKind === "quote" && message.kind === "quote" && message.shareId === targetId) {
          return { ...message, reactions };
        }
        return message;
      }),
    );
  }

  function setGroupReactions(
    targetKind: "text" | "quote",
    targetId: string,
    reactions: ChatReaction[],
  ) {
    setGroupMessages((prev) =>
      prev.map((message) => {
        if (targetKind === "text" && message.kind === "text" && message.id === targetId) {
          return { ...message, reactions };
        }
        if (targetKind === "quote" && message.kind === "quote" && message.shareId === targetId) {
          return { ...message, reactions };
        }
        return message;
      }),
    );
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    const result =
      mode === "dm" && peerUserId
        ? await postDmChatMessage(peerUserId, body)
        : mode === "group" && groupId
          ? await postGroupChatMessage(groupId, body)
          : { error: "Missing chat" };
    setSending(false);
    if ("error" in result) {
      setSendError(result.error);
      return;
    }
    setDraft("");
    stickToBottomRef.current = true;
    setQuotesOnly(false);
    if (mode === "dm") {
      setDmMessages((prev) => [...prev, result.message]);
    } else {
      setGroupMessages((prev) => [...prev, result.message]);
    }
  }

  const visibleDm = quotesOnly
    ? dmMessages.filter((message) => message.kind === "quote")
    : dmMessages;
  const visibleGroup = quotesOnly
    ? groupMessages.filter((message) => message.kind === "quote")
    : groupMessages;

  const empty =
    !loading &&
    !error &&
    ((mode === "dm" && dmMessages.length === 0) ||
      (mode === "group" && groupMessages.length === 0));
  const emptyQuotes =
    !loading &&
    !error &&
    !empty &&
    quotesOnly &&
    ((mode === "dm" && visibleDm.length === 0) ||
      (mode === "group" && visibleGroup.length === 0));

  return (
    <section className="panel chats-thread-panel">
      <div className="chats-thread-top">
        <button type="button" className="button ghost back-link" onClick={onBack}>
          ← Chats
        </button>
        <div className="section-header chats-thread-heading">
          <div>
            <h2>{title}</h2>
            <p className="muted">
              {mode === "group"
                ? "Shared group chat — type here or send lines from Curate."
                : "Direct chat — type here or send lines from Curate."}
            </p>
          </div>
          <div className="chats-thread-filter" role="group" aria-label="Show messages">
            <button
              type="button"
              className={`button${quotesOnly ? " ghost" : " primary"}`}
              aria-pressed={!quotesOnly}
              onClick={() => setQuotesOnly(false)}
            >
              All
            </button>
            <button
              type="button"
              className={`button${quotesOnly ? " primary" : " ghost"}`}
              aria-pressed={quotesOnly}
              onClick={() => setQuotesOnly(true)}
            >
              Quotes
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="share-message">{error}</p> : null}

      {!loading && !error ? (
        <div className="chats-thread-body">
          <div className="chats-thread-scroll" onScroll={handleThreadScroll}>
            {empty ? (
              <p className="muted">No messages yet. Say hello or send a line from Curate.</p>
            ) : null}
            {emptyQuotes ? (
              <p className="muted">No quotes in this thread yet. Switch to All to see chat.</p>
            ) : null}

            {mode === "dm" ? (
              <ul className="inbox-line-list chats-message-list">
                {visibleDm.map((message) =>
                  message.kind === "text" ? (
                    <li key={`t-${message.id}`}>
                      <TextBubble
                        body={message.body}
                        fromLabel={message.youSent ? "You" : message.from.displayName}
                        youSent={message.youSent}
                        messageId={message.id}
                        reactions={message.reactions}
                        peerUserId={peerUserId}
                        onReactions={(reactions) => setDmReactions("text", message.id, reactions)}
                      />
                    </li>
                  ) : (
                    <li key={`q-${message.id}`}>
                      {message.playable ? (
                        <InboxLineCard
                          item={dmToInboxItem(message)}
                          entries={entries}
                          showQuoteActions
                          shareId={message.shareId}
                          reactions={message.reactions}
                          peerUserId={peerUserId}
                          onReactions={(reactions) =>
                            setDmReactions("quote", message.shareId, reactions)
                          }
                        />
                      ) : (
                        <OutgoingPreview
                          titleId={message.titleId}
                          lineIndex={message.lineIndex}
                          label={entryLabel(message.titleId)}
                          fromLabel="You sent"
                          receiptLabel={dmReceiptLabel(message.receipt)}
                          answeredLabel={message.peerAnswered ? "Correct" : null}
                          shareId={message.shareId}
                          reactions={message.reactions}
                          peerUserId={peerUserId}
                          onReactions={(reactions) =>
                            setDmReactions("quote", message.shareId, reactions)
                          }
                        />
                      )}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <ul className="inbox-line-list chats-message-list">
                {visibleGroup.map((message) => {
                  if (message.kind === "text") {
                    return (
                      <li key={`t-${message.id}`}>
                        <TextBubble
                          body={message.body}
                          fromLabel={message.youSent ? "You" : message.from.displayName}
                          youSent={message.youSent}
                          messageId={message.id}
                          reactions={message.reactions}
                          groupId={groupId}
                          onReactions={(reactions) =>
                            setGroupReactions("text", message.id, reactions)
                          }
                        />
                      </li>
                    );
                  }
                  const playable = groupToInboxItem(message);
                  return (
                    <li key={`q-${message.shareId}`}>
                      {playable && message.playable ? (
                        <InboxLineCard
                          item={playable}
                          entries={entries}
                          showQuoteActions
                          shareId={message.shareId}
                          reactions={message.reactions}
                          groupId={groupId}
                          onReactions={(reactions) =>
                            setGroupReactions("quote", message.shareId, reactions)
                          }
                        />
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
                          answeredLabel={groupAnsweredLabel(
                            message.youSent,
                            message.answeredCount,
                            message.sentCount,
                          )}
                          shareId={message.shareId}
                          reactions={message.reactions}
                          groupId={groupId}
                          onReactions={(reactions) =>
                            setGroupReactions("quote", message.shareId, reactions)
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div ref={endRef} className="chats-thread-end" aria-hidden="true" />
          </div>

          {showJumpLatest ? (
            <button
              type="button"
              className="button ghost chats-jump-latest"
              onClick={() => scrollToLatest("smooth")}
            >
              ↓ Latest
            </button>
          ) : null}

          <form className="chats-composer" onSubmit={(event) => void handleSend(event)}>
            <label className="sr-only" htmlFor="chat-composer-input">
              Message
            </label>
            <textarea
              id="chat-composer-input"
              rows={2}
              maxLength={1000}
              value={draft}
              placeholder="Write a message…"
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend(event);
                }
              }}
            />
            <button type="submit" className="button primary" disabled={sending || !draft.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
            {sendError ? <p className="share-message">{sendError}</p> : null}
          </form>
        </div>
      ) : null}
    </section>
  );
}
