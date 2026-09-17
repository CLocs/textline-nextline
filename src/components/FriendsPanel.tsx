import { useEffect, useState } from "react";
import type { AuthUser } from "../lib/auth/session";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import {
  blockFriend,
  fetchFriends,
  fetchOrCreateInvite,
  rememberInviteUrl,
  rotateFriendInvite,
  storedInviteUrl,
  unfriendUser,
  type FriendListItem,
} from "../lib/friends/api";

type Props = {
  user: AuthUser;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FriendsPanel({ user }: Props) {
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [reused, setReused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiReady = isAuthApiEnabled() && !isLocalDevSession();

  useEffect(() => {
    if (!apiReady) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const [invite, list] = await Promise.all([fetchOrCreateInvite(), fetchFriends()]);
      if (cancelled) return;
      if ("error" in invite) {
        setError(invite.error);
        setLoading(false);
        return;
      }
      if ("error" in list) {
        setError(list.error);
        setLoading(false);
        return;
      }
      const nextUrl = invite.url ?? storedInviteUrl(user);
      if (invite.url) rememberInviteUrl(user, invite.url);
      setUrl(nextUrl);
      setReused(invite.reused && !invite.url);
      setFriends(list);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [apiReady, user]);

  async function handleCopy() {
    if (!url) return;
    const ok = await copyText(url);
    setMessage(ok ? "Copied friend link." : url);
  }

  async function handleRotate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await rotateFriendInvite();
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (!result.url) {
      setError("Could not rotate friend link");
      return;
    }
    rememberInviteUrl(user, result.url);
    setUrl(result.url);
    setReused(false);
    setMessage("New link ready. The old one no longer works.");
  }

  async function handleRemove(friend: FriendListItem) {
    setBusy(true);
    setError(null);
    const result = await unfriendUser(friend.userId);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setFriends((current) => current.filter((item) => item.userId !== friend.userId));
  }

  async function handleBlock(friend: FriendListItem) {
    setBusy(true);
    setError(null);
    const result = await blockFriend(friend.userId);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setFriends((current) => current.filter((item) => item.userId !== friend.userId));
  }

  if (!apiReady) {
    return (
      <p className="muted">
        Friend links need a signed-in account on the live API — not the Local Vite shortcut.
      </p>
    );
  }

  if (loading) {
    return <p className="muted">Loading friends…</p>;
  }

  return (
    <div className="friends-panel">
      <h3 className="library-group-heading">Your friend link</h3>
      <p className="muted">
        Send this to someone you know. They sign in and tap Accept. There is no public user list.
      </p>
      {url ? (
        <p className="friends-link">{url}</p>
      ) : (
        <p className="muted">
          A link is already active on this account. Rotate to copy a new one (the old link stops
          working).
        </p>
      )}
      <div className="row friends-actions">
        <button type="button" className="button primary" disabled={!url || busy} onClick={() => void handleCopy()}>
          Copy link
        </button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => void handleRotate()}>
          {busy ? "Working…" : "Rotate link"}
        </button>
      </div>
      {reused && !url ? (
        <p className="muted">Rotate if you no longer have the previous URL.</p>
      ) : null}

      <h3 className="library-group-heading">Friends</h3>
      {friends.length === 0 ? (
        <p className="empty">No friends yet. Share your link.</p>
      ) : (
        <ul className="title-list">
          {friends.map((friend) => (
            <li key={friend.userId}>
              <div className="title-card friends-card">
                <span className="title-card-copy">
                  <span className="title-card-name">{friend.displayName}</span>
                </span>
                <span className="friends-card-actions">
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() => void handleRemove(friend)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() => void handleBlock(friend)}
                  >
                    Block
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="muted">{message}</p>}
      {error && (
        <p className="feedback wrong" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
