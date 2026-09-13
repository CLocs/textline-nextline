export type ProfileTab = "account" | "history" | "stats";

export type HashRoute =
  | { kind: "home" }
  | { kind: "login"; returnTo?: string }
  | { kind: "auth"; token: string }
  | { kind: "play"; shareId: string }
  | { kind: "profile"; tab: ProfileTab };

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
    return { kind: "login", returnTo: params.get("return") ?? undefined };
  }

  if (path === "auth" || path.startsWith("auth")) {
    const token = params.get("token");
    if (token) return { kind: "auth", token };
    return { kind: "login" };
  }

  const playMatch = path.match(/^play\/([^/]+)$/);
  if (playMatch?.[1]) {
    return { kind: "play", shareId: decodeURIComponent(playMatch[1]) };
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
