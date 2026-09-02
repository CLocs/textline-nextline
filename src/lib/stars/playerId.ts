const PLAYER_ID_KEY = "textline-nextline-player-id";

function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getOrCreatePlayerId(): string {
  if (typeof localStorage === "undefined") return createUuid();
  const existing = localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const created = createUuid();
  localStorage.setItem(PLAYER_ID_KEY, created);
  return created;
}
