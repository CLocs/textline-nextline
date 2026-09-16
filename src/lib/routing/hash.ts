export type ProfileTab = "account" | "history" | "stats";

export type HashRoute =
  | { kind: "home" }
  | { kind: "login"; returnTo?: string }
  | { kind: "auth"; token: string; returnTo?: string }
  | { kind: "play"; shareId: string }
  | { kind: "profile"; tab: ProfileTab }
  | { kind: "ops" };

const LOGIN_RETURN_KEY = "textline-nextline-login-return";

/** Internal hash paths we may resume after magic-link sign-in. */
export function isSafeLoginReturn(value: string | null | undefined): value is string {
  if (!value) return false;
  if (value === "ops") return true;
  if (value === "profile" || value === "profile/history" || value === "profile/stats") return true;
  return /^play\/[A-Za-z0-9_-]{1,64}$/.test(value);
}

export function rememberLoginReturn(path: string | undefined): void {
  if (typeof localStorage === "undefined") return;
  if (path && isSafeLoginReturn(path)) {
    localStorage.setItem(LOGIN_RETURN_KEY, path);
    return;
  }
  localStorage.removeItem(LOGIN_RETURN_KEY);
}

export function peekLoginReturn(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const raw = localStorage.getItem(LOGIN_RETURN_KEY);
  return isSafeLoginReturn(raw) ? raw : undefined;
}

export function consumeLoginReturn(): string | undefined {
  const value = peekLoginReturn();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LOGIN_RETURN_KEY);
  }
  return value;
}

export function loginReturnFromRoute(route: HashRoute): string | undefined {
  if (route.kind === "login" || route.kind === "auth") {
    return isSafeLoginReturn(route.returnTo) ? route.returnTo : undefined;
  }
  if (route.kind === "play") return `play/${route.shareId}`;
  if (route.kind === "profile") return profileHash(route.tab);
  if (route.kind === "ops") return "ops";
  return undefined;
}

function parseProfileTab(path: string): ProfileTab | null {
  if (path === "profile" || path === "profile/account") return "account";
  if (path === "profile/history") return "history";
  if (path === "profile/stats") return "stats";
  return null;
}

export function parseHash(hash = typeof window !== "undefined" ? window.location.hash : ""): HashRoute {
  const raw = hash.replace(/^#/, "").replace(/^\//, "");
  if (!raw) return { kind: "home" };

  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart ?? "";
  const params = new URLSearchParams(queryPart ?? "");

  if (path === "login") {
    const returnTo = params.get("return");
    return isSafeLoginReturn(returnTo)
      ? { kind: "login", returnTo }
      : { kind: "login" };
  }

  if (path === "auth" || path.startsWith("auth")) {
    const token = params.get("token");
    const returnTo = params.get("return");
    const safeReturn = isSafeLoginReturn(returnTo) ? returnTo : undefined;
    if (token) {
      return safeReturn
        ? { kind: "auth", token, returnTo: safeReturn }
        : { kind: "auth", token };
    }
    return safeReturn ? { kind: "login", returnTo: safeReturn } : { kind: "login" };
  }

  const playMatch = path.match(/^play\/([^/]+)$/);
  if (playMatch?.[1]) {
    return { kind: "play", shareId: decodeURIComponent(playMatch[1]) };
  }

  if (path === "ops") {
    return { kind: "ops" };
  }

  const profileTab = parseProfileTab(path);
  if (profileTab) {
    return { kind: "profile", tab: profileTab };
  }

  return { kind: "home" };
}

export function profileHash(tab: ProfileTab): string {
  if (tab === "account") return "profile";
  return `profile/${tab}`;
}

export function setHash(route: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = route.startsWith("/") ? route : `/${route}`;
}

export function clearHash(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
}
