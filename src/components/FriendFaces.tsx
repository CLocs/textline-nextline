import { useEffect, useState } from "react";
import { fetchAvatarObjectUrl } from "../lib/auth/api";
import { friendFaceLabel, friendInitials } from "../lib/friends/faces";
import type { FriendListItem } from "../lib/friends/api";

type Props = {
  friends: FriendListItem[];
  label?: string;
  className?: string;
};

function FriendFace({ friend }: { friend: FriendListItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const streak = friend.streak > 0 ? friend.streak : 0;
  const text = friendFaceLabel({ ...friend, streak });

  useEffect(() => {
    if (!friend.avatarAt) {
      setSrc(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    void fetchAvatarObjectUrl(friend.userId).then((next) => {
      if (cancelled) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      url = next;
      setSrc(next);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [friend.userId, friend.avatarAt]);

  return (
    <span className="friend-face" aria-label={text} title={text}>
      {src ? (
        <img className="friend-face-photo" src={src} alt="" />
      ) : (
        <span className="friend-face-initials" aria-hidden="true">
          {friendInitials(friend.displayName)}
        </span>
      )}
      {streak > 0 ? (
        <span className="friend-face-badge" aria-hidden="true">
          {streak}
        </span>
      ) : null}
    </span>
  );
}

export function FriendFaces({ friends, label = "Friends", className }: Props) {
  if (friends.length === 0) return null;
  const classes = className ? `friend-faces ${className}` : "friend-faces";
  return (
    <ul className={classes} aria-label={label}>
      {friends.map((friend) => (
        <li key={friend.userId}>
          <FriendFace friend={friend} />
        </li>
      ))}
    </ul>
  );
}
