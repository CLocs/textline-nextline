import type { FriendListItem } from "./api.js";

export const HOME_FRIEND_LIMIT = 5;

export function friendInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((word) => word.slice(0, 1));
  return letters.join("").toUpperCase();
}

export function friendFaceLabel(friend: FriendListItem): string {
  return friend.streak > 0 ? `${friend.displayName}, ${friend.streak}-day streak` : friend.displayName;
}

/** Highest current streak first. Ties follow the display name. */
export function bestFriends(friends: FriendListItem[], limit = HOME_FRIEND_LIMIT): FriendListItem[] {
  return [...friends]
    .sort(
      (a, b) =>
        b.streak - a.streak || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
    )
    .slice(0, limit);
}
