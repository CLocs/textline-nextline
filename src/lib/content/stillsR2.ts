import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STILLS_R2_BUCKET } from "./stillKeys.js";
import type { RemoteStill } from "./stillsSyncPlan.js";

const API = "https://api.cloudflare.com/client/v4";

type CloudflareAuth = { accountId: string; token: string };

let authPromise: Promise<CloudflareAuth> | null = null;

export function resetCloudflareAuthCache(): void {
  authPromise = null;
}

function readTokenFile(configPath: string): string {
  const toml = readFileSync(configPath, "utf8");
  const api = toml.match(/^api_token\s*=\s*"([^"]+)"/m);
  if (api?.[1]) return api[1];
  const oauth = toml.match(/^oauth_token\s*=\s*"([^"]+)"/m);
  if (oauth?.[1]) return oauth[1];
  throw new Error(`No api_token or oauth_token in ${configPath}. Run npx wrangler login.`);
}

/** Wrangler login, refreshed via `whoami`, unless both Cloudflare env vars are set. */
export function cloudflareAuth(packageRoot: string): Promise<CloudflareAuth> {
  const envToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const envAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (envToken && envAccount) return Promise.resolve({ accountId: envAccount, token: envToken });
  authPromise ??= loadWranglerAuth(packageRoot);
  return authPromise;
}

function loadWranglerAuth(packageRoot: string): Promise<CloudflareAuth> {
  const wranglerJs = join(packageRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  let out = "";
  try {
    out = execFileSync(process.execPath, [wranglerJs, "whoami"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    throw new Error(
      `wrangler whoami failed. Run npx wrangler login.${stderr ? `\n${stderr.slice(0, 400)}` : ""}`,
    );
  }
  const accountId = out.match(/\b([0-9a-f]{32})\b/)?.[1];
  const configPath = out.match(/Credentials are stored in:\s*(.+)/)?.[1]?.trim();
  if (!accountId || !configPath) {
    throw new Error("Could not read the Cloudflare account from wrangler whoami.");
  }
  return Promise.resolve({ accountId, token: readTokenFile(configPath) });
}

type ListedObject = { key?: unknown; size?: unknown; etag?: unknown };

function listedObjects(body: unknown): ListedObject[] {
  if (!body || typeof body !== "object") return [];
  const result = (body as { result?: unknown }).result;
  if (Array.isArray(result)) return result as ListedObject[];
  if (result && typeof result === "object" && Array.isArray((result as { objects?: unknown }).objects)) {
    return (result as { objects: ListedObject[] }).objects;
  }
  return [];
}

function nextCursor(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const info = (body as { result_info?: { is_truncated?: unknown; cursor?: unknown } }).result_info;
  if (!info?.is_truncated || typeof info.cursor !== "string" || !info.cursor) return null;
  return info.cursor;
}

/** Every object under `prefix` (key, size, etag). Paginates 1000 at a time. */
export async function listRemoteStills(
  packageRoot: string,
  prefix: string,
  bucket = STILLS_R2_BUCKET,
): Promise<Map<string, RemoteStill>> {
  const auth = await cloudflareAuth(packageRoot);
  const found = new Map<string, RemoteStill>();
  let cursor: string | null = null;
  for (;;) {
    const url = new URL(`${API}/accounts/${auth.accountId}/r2/buckets/${bucket}/objects`);
    url.searchParams.set("per_page", "1000");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`R2 list failed (${response.status}): ${text.slice(0, 300)}`);
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new Error("R2 list returned non-JSON.");
    }
    const success = body && typeof body === "object" && (body as { success?: unknown }).success;
    if (success === false) {
      throw new Error(`R2 list failed: ${text.slice(0, 300)}`);
    }
    for (const object of listedObjects(body)) {
      if (typeof object.key !== "string" || !object.key) continue;
      found.set(object.key, {
        size: typeof object.size === "number" ? object.size : Number(object.size) || 0,
        etag: typeof object.etag === "string" ? object.etag : "",
      });
    }
    cursor = nextCursor(body);
    if (!cursor) break;
  }
  return found;
}
