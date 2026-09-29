import { friendFaceLabel, friendInitials } from "../lib/friends/faces";
import type { FriendListItem } from "../lib/friends/api";

type Props = {
  friends: FriendListItem[];
  label?: string;
  className?: string;
};

export function FriendFaces({ friends, label = "Friends", className }: Props) {
  if (friends.length === 0) return null;
  const classes = className ? `friend-faces ${className}` : "friend-faces";
  return (
    <ul className={classes} aria-label={label}>
      {friends.map((friend) => {
        const streak = friend.streak > 0 ? friend.streak : 0;
        const text = friendFaceLabel({ ...friend, streak });
        return (
          <li key={friend.userId}>
            <span className="friend-face" aria-label={text} title={text}>
              <span className="friend-face-initials" aria-hidden="true">
                {friendInitials(friend.displayName)}
              </span>
              {streak > 0 ? (
                <span className="friend-face-badge" aria-hidden="true">
                  {streak}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
