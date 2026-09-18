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
import {
  addFriendToGroup,
  createFriendGroup,
  deleteFriendGroup,
  fetchGroups,
  removeFriendFromGroup,
  type FriendGroup,
} from "../lib/groups/api";

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

function dropMember(groups: FriendGroup[], userId: string): FriendGroup[] {
  return groups.map((group) => ({
    ...group,
    members: group.members.filter((member) => member.userId !== userId),
  }));
}

export function FriendsPanel({ user }: Props) {
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [reused, setReused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [addPick, setAddPick] = useState<Record<string, string>>({});

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
      const [invite, list, groupList] = await Promise.all([
        fetchOrCreateInvite(),
        fetchFriends(),
        fetchGroups(),
      ]);
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
      if ("error" in groupList) {
        setError(groupList.error);
        setLoading(false);
        return;
      }
      const nextUrl = invite.url ?? storedInviteUrl(user);
      if (invite.url) rememberInviteUrl(user, invite.url);
      setUrl(nextUrl);
      setReused(invite.reused && !invite.url);
      setFriends(list);
      setGroups(groupList);
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
    setGroups((current) => dropMember(current, friend.userId));
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
    setGroups((current) => dropMember(current, friend.userId));
  }

  async function handleCreateGroup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await createFriendGroup(newGroupName);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setGroups((current) => [...current, result]);
    setNewGroupName("");
    setMessage(`Created ${result.name}.`);
  }

  async function handleAddMember(group: FriendGroup) {
    const userId = addPick[group.id];
    if (!userId) return;
    const friend = friends.find((item) => item.userId === userId);
    setBusy(true);
    setError(null);
    const result = await addFriendToGroup(group.id, userId);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setGroups((current) =>
      current.map((item) =>
        item.id !== group.id || !friend
          ? item
          : {
              ...item,
              members: item.members.some((member) => member.userId === friend.userId)
                ? item.members
                : [...item.members, { userId: friend.userId, displayName: friend.displayName }],
            },
      ),
    );
    setAddPick((current) => ({ ...current, [group.id]: "" }));
  }

  async function handleRemoveMember(group: FriendGroup, memberId: string) {
    setBusy(true);
    setError(null);
    const result = await removeFriendFromGroup(group.id, memberId);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setGroups((current) =>
      current.map((item) =>
        item.id !== group.id
          ? item
          : { ...item, members: item.members.filter((member) => member.userId !== memberId) },
      ),
    );
  }

  async function handleDeleteGroup(group: FriendGroup) {
    setBusy(true);
    setError(null);
    const result = await deleteFriendGroup(group.id);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setGroups((current) => current.filter((item) => item.id !== group.id));
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

      <h3 className="library-group-heading">Groups</h3>
      <p className="muted">Private send-lists of your friends — not shared rooms.</p>
      <form
        className="friends-group-create"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreateGroup();
        }}
      >
        <input
          type="text"
          maxLength={40}
          value={newGroupName}
          placeholder="Movie night"
          aria-label="New group name"
          disabled={busy}
          onChange={(event) => setNewGroupName(event.target.value)}
        />
        <button type="submit" className="button primary" disabled={busy || !newGroupName.trim()}>
          Create
        </button>
      </form>
      {groups.length === 0 ? (
        <p className="empty">No groups yet. Name one, then add friends.</p>
      ) : (
        <ul className="title-list">
          {groups.map((group) => {
            const memberIds = new Set(group.members.map((member) => member.userId));
            const available = friends.filter((friend) => !memberIds.has(friend.userId));
            return (
              <li key={group.id}>
                <div className="title-card friends-card friends-group-card">
                  <span className="title-card-copy">
                    <span className="title-card-name">{group.name}</span>
                    {group.members.length === 0 ? (
                      <span className="muted">No members yet</span>
                    ) : (
                      <span className="friends-group-members">
                        {group.members.map((member) => (
                          <span key={member.userId} className="friends-group-member">
                            {member.displayName}
                            <button
                              type="button"
                              className="friends-group-remove"
                              disabled={busy}
                              aria-label={`Remove ${member.displayName} from ${group.name}`}
                              onClick={() => void handleRemoveMember(group, member.userId)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </span>
                    )}
                    {available.length > 0 ? (
                      <span className="friends-group-add">
                        <select
                          aria-label={`Add a friend to ${group.name}`}
                          value={addPick[group.id] ?? ""}
                          disabled={busy}
                          onChange={(event) =>
                            setAddPick((current) => ({ ...current, [group.id]: event.target.value }))
                          }
                        >
                          <option value="">Add a friend</option>
                          {available.map((friend) => (
                            <option key={friend.userId} value={friend.userId}>
                              {friend.displayName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={busy || !addPick[group.id]}
                          onClick={() => void handleAddMember(group)}
                        >
                          Add
                        </button>
                      </span>
                    ) : null}
                  </span>
                  <span className="friends-card-actions">
                    <button
                      type="button"
                      className="button ghost"
                      disabled={busy}
                      onClick={() => void handleDeleteGroup(group)}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
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
