export type ProfileTab = "account" | "history" | "stats" | "friends" | "chats" | "inbox" | "parallels";

export type HashRoute =
  | { kind: "home" }
  | { kind: "login"; returnTo?: string }
  | { kind: "auth"; token: string; returnTo?: string }
  | { kind: "play"; shareId: string }
  | { kind: "parallel"; packId: string }
  | { kind: "friend"; token: string }
  | { kind: "chats" }
  | { kind: "chat"; peerUserId: string }
  | { kind: "chatGroup"; groupId: string }
  | { kind: "profile"; tab: ProfileTab }
  | { kind: "ops" };

const LOGIN_RETURN_KEY = "textline-nextline-login-return";

/** Internal hash paths we may resume after magic-link sign-in. */
export function isSafeLoginReturn(value: string | null | undefined): value is string {
  if (!value) return false;
  if (value === "ops" || value === "chats") return true;
  if (
    value === "profile" ||
    value === "profile/history" ||
    value === "profile/stats" ||
    value === "profile/friends" ||
    value === "profile/inbox" ||
    value === "profile/chats" ||
    value === "profile/parallels"
  ) {
    return true;
  }
  if (/^play\/[A-Za-z0-9_-]{1,64}$/.test(value)) return true;
  if (/^parallel\/[A-Za-z0-9_-]{1,64}$/.test(value)) return true;
  if (/^chat\/[A-Za-z0-9_-]{1,64}$/.test(value)) return true;
  if (/^chat\/group\/[A-Za-z0-9_-]{1,64}$/.test(value)) return true;
  return /^friend\/[a-f0-9]{24}$/i.test(value);
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
  if (route.kind === "parallel") return `parallel/${route.packId}`;
  if (route.kind === "friend") return `friend/${route.token}`;
  if (route.kind === "chats") return "chats";
  if (route.kind === "chat") return `chat/${route.peerUserId}`;
  if (route.kind === "chatGroup") return `chat/group/${route.groupId}`;
  if (route.kind === "profile") return profileHash(route.tab === "inbox" ? "chats" : route.tab);
  if (route.kind === "ops") return "ops";
  return undefined;
}

function parseProfileTab(path: string): ProfileTab | null {
  if (path === "profile" || path === "profile/account") return "account";
  if (path === "profile/history") return "history";
  if (path === "profile/stats") return "stats";
  if (path === "profile/friends") return "friends";
  if (path === "profile/inbox" || path === "profile/chats") return "chats";
  if (path === "profile/parallels") return "parallels";
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

  const parallelMatch = path.match(/^parallel\/([^/]+)$/);
  if (parallelMatch?.[1]) {
    return { kind: "parallel", packId: decodeURIComponent(parallelMatch[1]) };
  }

  const friendMatch = path.match(/^friend\/([^/]+)$/);
  if (friendMatch?.[1]) {
    return { kind: "friend", token: decodeURIComponent(friendMatch[1]) };
  }

  const chatGroupMatch = path.match(/^chat\/group\/([^/]+)$/);
  if (chatGroupMatch?.[1]) {
    return { kind: "chatGroup", groupId: decodeURIComponent(chatGroupMatch[1]) };
  }

  const chatMatch = path.match(/^chat\/([^/]+)$/);
  if (chatMatch?.[1]) {
    return { kind: "chat", peerUserId: decodeURIComponent(chatMatch[1]) };
  }

  if (path === "chats") {
    return { kind: "chats" };
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
  if (tab === "inbox") return "profile/chats";
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
