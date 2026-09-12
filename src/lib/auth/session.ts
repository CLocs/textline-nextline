export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

const SESSION_KEY = "textline-nextline-session";
const USER_KEY = "textline-nextline-user";

export function getSessionToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(sessionToken: string, user: AuthUser): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SESSION_KEY, sessionToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getSessionToken());
}
