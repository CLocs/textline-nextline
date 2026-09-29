import { describe, expect, it } from "vitest";
import type { FriendListItem } from "../src/lib/friends/api.js";
import { bestFriends, friendInitials, HOME_FRIEND_LIMIT } from "../src/lib/friends/faces.js";

function friend(displayName: string, streak: number): FriendListItem {
  return { userId: displayName.toLowerCase(), displayName, streak, avatarAt: null };
}

describe("best friends for home", () => {
  it("keeps the five highest current streaks, then name", () => {
    const picked = bestFriends([
      friend("Ada", 1),
      friend("Bea", 9),
      friend("Cal", 9),
      friend("Dee", 0),
      friend("Eve", 4),
      friend("Fay", 3),
      friend("Gil", 2),
    ]);
    expect(picked.map((row) => row.displayName)).toEqual(["Bea", "Cal", "Eve", "Fay", "Gil"]);
    expect(picked).toHaveLength(HOME_FRIEND_LIMIT);
  });

  it("fills from friends with no badge when fewer than five have a streak", () => {
    const picked = bestFriends([friend("Zoe", 0), friend("Ann", 2), friend("Mo", 0)]);
    expect(picked.map((row) => row.displayName)).toEqual(["Ann", "Mo", "Zoe"]);
  });

  it("uses the first letters of the display name", () => {
    expect(friendInitials("Ada Lovelace")).toBe("AL");
    expect(friendInitials("bea")).toBe("B");
    expect(friendInitials("  ")).toBe("?");
  });
});
