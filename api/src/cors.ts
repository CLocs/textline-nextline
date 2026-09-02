const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://textline-nextline.pages.dev",
];

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return DEFAULT_ORIGINS;
  return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.textline-nextline\.pages\.dev$/i.test(origin)) return true;
  return false;
}

export function corsHeaders(origin: string | null, allowed: string[]): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Player-Id",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && isAllowedOrigin(origin, allowed)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
}
