import { useEffect, useRef, useState } from "react";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { fetchFriends, type FriendListItem } from "../lib/friends/api";
import { fetchGroups, type FriendGroup } from "../lib/groups/api";
import { copyLineShare, sendLineToFriend, sendLineToGroup } from "../lib/inbox/api";
import { QuoteImageExportModal } from "./QuoteImageExportModal";

const CLOSE_QUOTE_EXPORT = "tlnl:close-quote-export";

type Props = {
  titleId: string;
  lineIndex: number;
  /** Open the send menu on mount (used when Curate lazy-hydrates on click). */
  autoOpen?: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LineSendControl({ titleId, lineIndex, autoOpen = false }: Props) {
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [copyBusy, setCopyBusy] = useState(false);
  const [busyTargets, setBusyTargets] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentPeople, setSentPeople] = useState<Set<string>>(new Set());
  const [sentGroups, setSentGroups] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setOpen(autoOpen);
    setMessage(null);
    setError(null);
    setSentPeople(new Set());
    setSentGroups(new Set());
    setBusyTargets(new Set());
    setCopyBusy(false);
    setExportOpen(false);
  }, [titleId, lineIndex, autoOpen]);

  useEffect(() => {
    if (!open || !autoOpen) return;
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) {
      setAnchor({ top: box.bottom + 6, right: window.innerWidth - box.right });
    }
  }, [open, autoOpen]);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !apiReady) return;
    let cancelled = false;
    void Promise.all([fetchFriends(), fetchGroups()]).then(([list, groupList]) => {
      if (cancelled) return;
      if ("error" in list) {
        setError(list.error);
        return;
      }
      if ("error" in groupList) {
        setError(groupList.error);
        return;
      }
      setFriends(list);
      setGroups(groupList);
    });
    return () => {
      cancelled = true;
    };
  }, [open, apiReady]);

  useEffect(() => {
    function onCloseExport() {
      setExportOpen(false);
    }
    window.addEventListener(CLOSE_QUOTE_EXPORT, onCloseExport);
    return () => window.removeEventListener(CLOSE_QUOTE_EXPORT, onCloseExport);
  }, []);

  function toggle() {
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) {
      setAnchor({ top: box.bottom + 6, right: window.innerWidth - box.right });
    }
    setMessage(null);
    setError(null);
    setOpen((value) => !value);
  }

  function openExport() {
    setOpen(false);
    window.dispatchEvent(new Event(CLOSE_QUOTE_EXPORT));
    setExportOpen(true);
  }

  function markBusy(key: string, busy: boolean) {
    setBusyTargets((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleCopy() {
    setCopyBusy(true);
    setError(null);
    const result = await copyLineShare(titleId, lineIndex);
    setCopyBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const ok = await copyText(result.url);
    setMessage(ok ? "Copied one-line link." : result.url);
  }

  async function handleSendGroup(group: FriendGroup) {
    const key = `group:${group.id}`;
    markBusy(key, true);
    setError(null);
    const result = await sendLineToGroup(titleId, lineIndex, group.id);
    markBusy(key, false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSentGroups((current) => new Set(current).add(group.id));
    if (result.skipped === 0) {
      setSentPeople((current) => {
        const next = new Set(current);
        for (const member of group.members) next.add(member.userId);
        return next;
      });
    }
    setMessage(
      result.skipped > 0
        ? `Sent to ${group.name} (${result.skipped} skipped).`
        : null,
    );
  }

  async function handleSend(friend: FriendListItem) {
    const key = `friend:${friend.userId}`;
    markBusy(key, true);
    setError(null);
    const result = await sendLineToFriend(titleId, lineIndex, friend.userId);
    markBusy(key, false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSentPeople((current) => new Set(current).add(friend.userId));
    setMessage(null);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="curate-send"
        aria-label="Share this line"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Export image, send, or copy this line"
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">
          <path
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 1.75v7.5M5.25 4.25 8 1.5l2.75 2.75M3.5 7.75v5a1.25 1.25 0 0 0 1.25 1.25h6.5A1.25 1.25 0 0 0 12.5 12.75v-5"
          />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="curate-send-menu"
          role="dialog"
          aria-label="Share this line"
          style={{ top: anchor.top, right: anchor.right }}
        >
          <button type="button" className="button primary" onClick={openExport}>
            Export image
          </button>
          {apiReady ? (
            <>
              <button
                type="button"
                className="button ghost"
                disabled={copyBusy}
                onClick={() => void handleCopy()}
              >
                Copy link
              </button>
              {friends.length === 0 && groups.length === 0 ? (
                <p className="muted">
                  No friends yet. Add someone in Profile → Friends, or copy the link.
                </p>
              ) : (
                <>
                  {groups.length > 0 ? (
                    <>
                      <p className="curate-send-heading">Groups</p>
                      <ul className="curate-send-friends">
                        {groups.map((group) => {
                          const sent = sentGroups.has(group.id);
                          const busy = busyTargets.has(`group:${group.id}`);
                          return (
                            <li key={group.id}>
                              <span>{group.name}</span>
                              <button
                                type="button"
                                className={`button ghost curate-send-target${sent ? " is-sent" : ""}`}
                                disabled={busy || sent}
                                onClick={() => void handleSendGroup(group)}
                              >
                                {sent ? "Sent" : busy ? "…" : "Send"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                  {friends.length > 0 ? (
                    <>
                      {groups.length > 0 ? <p className="curate-send-heading">Friends</p> : null}
                      <ul className="curate-send-friends">
                        {friends.map((friend) => {
                          const sent = sentPeople.has(friend.userId);
                          const busy = busyTargets.has(`friend:${friend.userId}`);
                          return (
                            <li key={friend.userId}>
                              <span>{friend.displayName}</span>
                              <button
                                type="button"
                                className={`button ghost curate-send-target${sent ? " is-sent" : ""}`}
                                disabled={busy || sent}
                                onClick={() => void handleSend(friend)}
                              >
                                {sent ? "Sent" : busy ? "…" : "Send"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
              {message ? <p className="muted">{message}</p> : null}
              {error ? (
                <p className="feedback wrong" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">Sign in on the live API to send or copy a link.</p>
          )}
        </div>
      ) : null}
      {exportOpen ? (
        <QuoteImageExportModal
          titleId={titleId}
          lineIndex={lineIndex}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </>
  );
}
