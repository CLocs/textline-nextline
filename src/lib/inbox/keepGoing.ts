const KEY = "tlnl-keep-going";

/** Remember that the next play of this title is the rest of a star streak. */
export function markKeepGoing(titleId: string): void {
  try {
    sessionStorage.setItem(KEY, titleId);
  } catch {
    // Private mode can reject storage. The play still starts.
  }
}

/** True once, when this play is the streak the card just offered. */
export function takeKeepGoing(titleId: string): boolean {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value === titleId;
  } catch {
    return false;
  }
}
