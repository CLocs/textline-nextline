import { useEffect, useRef, useState } from "react";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import { fetchFriends, type FriendListItem } from "../lib/friends/api";
import { fetchGroups, type FriendGroup } from "../lib/groups/api";
import { copyLineShare, sendLineToFriend, sendLineToGroup } from "../lib/inbox/api";

type Props = {
  titleId: string;
  lineIndex: number;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LineSendControl({ titleId, lineIndex }: Props) {
  const apiReady = isAuthApiEnabled() && !isLocalDevSession();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setMessage(null);
    setError(null);
  }, [titleId, lineIndex]);

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

  function toggle() {
    if (!apiReady) return;
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) {
      setAnchor({ top: box.bottom + 6, right: window.innerWidth - box.right });
    }
    setMessage(null);
    setError(null);
    setOpen((value) => !value);
  }

  async function handleCopy() {
    setBusy(true);
    setError(null);
    const result = await copyLineShare(titleId, lineIndex);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const ok = await copyText(result.url);
    setMessage(ok ? "Copied one-line link." : result.url);
  }

  async function handleSendGroup(group: FriendGroup) {
    setBusy(true);
    setError(null);
    const result = await sendLineToGroup(titleId, lineIndex, group.id);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessage(
      result.skipped > 0
        ? `Sent to ${group.name} (${result.skipped} skipped).`
        : `Sent to ${group.name}.`,
    );
  }

  async function handleSend(friend: FriendListItem) {
    setBusy(true);
    setError(null);
    const result = await sendLineToFriend(titleId, lineIndex, friend.userId);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessage(`Sent to ${friend.displayName}.`);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="curate-send"
        aria-label="Send this line"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!apiReady}
        title={apiReady ? "Send or copy this line" : "Sign in on the live API to send lines"}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M2.4 7.6 13 2.5c.6-.3 1.2.3.9.9L8.8 13.8c-.3.6-1.2.5-1.4-.2L6.2 9.4 2.2 8.2c-.7-.2-.6-1.1.2-1.4Z"
          />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="curate-send-menu"
          role="dialog"
          aria-label="Send this line"
          style={{ top: anchor.top, right: anchor.right }}
        >
          <button
            type="button"
            className="button primary"
            disabled={busy}
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
                    {groups.map((group) => (
                      <li key={group.id}>
                        <span>{group.name}</span>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={busy}
                          onClick={() => void handleSendGroup(group)}
                        >
                          Send
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {friends.length > 0 ? (
                <>
                  {groups.length > 0 ? <p className="curate-send-heading">Friends</p> : null}
                  <ul className="curate-send-friends">
                    {friends.map((friend) => (
                      <li key={friend.userId}>
                        <span>{friend.displayName}</span>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={busy}
                          onClick={() => void handleSend(friend)}
                        >
                          Send
                        </button>
                      </li>
                    ))}
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
        </div>
      ) : null}
    </>
  );
}
