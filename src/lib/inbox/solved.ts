export const INBOX_SOLVED_EVENT = "textline-inbox-solved";
export const INBOX_SOLVED_PREFIX = "textline-inbox-solved:";

export function inboxSolvedKey(id: string): string {
  return `${INBOX_SOLVED_PREFIX}${id}`;
}

export function isInboxItemSolved(id: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(inboxSolvedKey(id)) === "1";
}

export function markInboxItemSolved(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(inboxSolvedKey(id), "1");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INBOX_SOLVED_EVENT, { detail: { id } }));
  }
}

/** Local solve + server persist so the sender can see Correct / next line. */
export async function markInboxItemSolvedEverywhere(id: string): Promise<void> {
  markInboxItemSolved(id);
  try {
    const { markInboxSolvedRemote } = await import("./api.js");
    await markInboxSolvedRemote(id);
  } catch {
    // Local solve still counts for this device.
  }
}

export function countUnfilledInbox(items: { id: string }[]): number {
  return items.filter((item) => !isInboxItemSolved(item.id)).length;
}
