import {
  createId,
  createMagicToken,
  daysFromNow,
  displayNameFromEmail,
  isExpired,
  minutesFromNow,
  normalizeEmail,
  normalizeDisplayName,
  sha256Hex,
} from "./crypto.js";
import { isAllowedOrigin } from "./cors.js";
import { verifyGoogleIdToken } from "./google.js";

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

export type AuthEnv = {
  DB: D1Database;
  APP_ORIGIN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  AUTH_SECRET?: string;
  /** Google OAuth Web client ID (public). Enables GIS Sign-In when set. */
  GOOGLE_CLIENT_ID?: string;
};

const MAGIC_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 30;
const LINK_COOLDOWN_MS = 60_000;

function resolveLinkOrigin(
  env: AuthEnv,
  linkOrigin: string | null | undefined,
  allowedOrigins: string[] | undefined,
): string {
  const fallback = (env.APP_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");
  if (!linkOrigin || !allowedOrigins?.length) return fallback;
  const candidate = linkOrigin.replace(/\/$/, "");
  return isAllowedOrigin(candidate, allowedOrigins) ? candidate : fallback;
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function getSessionUser(db: D1Database, sessionId: string | null): Promise<User | null> {
  if (!sessionId) return null;

  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at AS session_expires,
              u.id, u.email, u.display_name, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .bind(sessionId)
    .first<{
      session_id: string;
      session_expires: string;
      id: string;
      email: string;
      display_name: string | null;
      created_at: string;
    }>();

  if (!row) return null;
  if (isExpired(row.session_expires)) {
    await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(row.session_id).run();
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export function sanitizeLoginReturn(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (value === "profile" || value === "profile/history" || value === "profile/stats") return value;
  if (/^play\/[A-Za-z0-9_-]{1,64}$/.test(value)) return value;
  return undefined;
}

export async function requestMagicLink(
  env: AuthEnv,
  emailRaw: string,
  options?: { linkOrigin?: string | null; allowedOrigins?: string[]; returnTo?: string | null },
): Promise<{ ok: true } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { error: "Invalid email", status: 400 };

  const recent = await env.DB
    .prepare(
      `SELECT expires_at FROM magic_tokens
       WHERE email = ? AND consumed_at IS NULL
       ORDER BY expires_at DESC LIMIT 1`,
    )
    .bind(email)
    .first<{ expires_at: string }>();

  if (recent) {
    const issuedAt = new Date(recent.expires_at).getTime() - MAGIC_TTL_MINUTES * 60_000;
    if (Date.now() - issuedAt < LINK_COOLDOWN_MS) {
      return { error: "Please wait a moment before requesting another link", status: 429 };
    }
  }

  const token = createMagicToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = minutesFromNow(MAGIC_TTL_MINUTES);

  await env.DB
    .prepare(
      `INSERT INTO magic_tokens (token_hash, email, expires_at, consumed_at)
       VALUES (?, ?, ?, NULL)`,
    )
    .bind(tokenHash, email, expiresAt)
    .run();

  const origin = resolveLinkOrigin(env, options?.linkOrigin, options?.allowedOrigins);
  const returnTo = sanitizeLoginReturn(options?.returnTo);
  const returnQuery = returnTo ? `&return=${encodeURIComponent(returnTo)}` : "";
  const link = `${origin}/#/auth?token=${encodeURIComponent(token)}${returnQuery}`;

  const sent = await sendMagicLinkEmail(env, email, link);
  if (!sent.ok) return sent;

  return { ok: true };
}

async function sendMagicLinkEmail(
  env: AuthEnv,
  email: string,
  link: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  if (!env.RESEND_API_KEY) {
    // Dev fallback: log link so local wrangler/tests can proceed without Resend
    console.log(`[auth] Magic link for ${email}: ${link}`);
    return { ok: true };
  }

  const from = env.RESEND_FROM ?? "Textline <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Textline → Nextline sign-in link",
      text: `Sign in to Textline → Nextline:\n\n${link}\n\nThis link expires in ${MAGIC_TTL_MINUTES} minutes.`,
    }),
  });

  if (!response.ok) {
    console.error("Resend error", await response.text());
    return { error: "Failed to send email", status: 502 };
  }

  return { ok: true };
}

export async function verifyMagicToken(
  db: D1Database,
  tokenRaw: string,
): Promise<{ user: User; sessionToken: string } | { error: string; status: number }> {
  const token = tokenRaw.trim();
  if (!token) return { error: "Missing token", status: 400 };

  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT email, expires_at, consumed_at FROM magic_tokens WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{ email: string; expires_at: string; consumed_at: string | null }>();

  if (!row) return { error: "Invalid or expired link", status: 400 };
  if (row.consumed_at) return { error: "Link already used", status: 400 };
  if (isExpired(row.expires_at)) return { error: "Invalid or expired link", status: 400 };

  await db
    .prepare(`UPDATE magic_tokens SET consumed_at = ? WHERE token_hash = ?`)
    .bind(new Date().toISOString(), tokenHash)
    .run();

  return signInWithEmail(db, row.email);
}

/** Find or create user by email, then issue a session (shared by magic link + Google). */
export async function signInWithEmail(
  db: D1Database,
  emailRaw: string,
  options?: { displayName?: string | null },
): Promise<{ user: User; sessionToken: string } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { error: "Invalid email", status: 400 };

  let user = await db
    .prepare(`SELECT id, email, display_name, created_at FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string; email: string; display_name: string | null; created_at: string }>();

  if (!user) {
    const id = createId();
    const createdAt = new Date().toISOString();
    const hint = options?.displayName?.trim();
    const displayName =
      hint && hint.length <= 40 ? hint : displayNameFromEmail(email);
    await db
      .prepare(
        `INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(id, email, displayName, createdAt)
      .run();
    user = { id, email, display_name: displayName, created_at: createdAt };
  }

  const sessionToken = createId();
  await db
    .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(sessionToken, user.id, daysFromNow(SESSION_TTL_DAYS))
    .run();

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
    sessionToken,
  };
}

export async function signInWithGoogle(
  env: AuthEnv,
  idToken: string,
): Promise<{ user: User; sessionToken: string } | { error: string; status: number }> {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return { error: "Google Sign-In is not configured", status: 503 };
  }

  const claims = await verifyGoogleIdToken(idToken, clientId);
  if ("error" in claims) return claims;

  return signInWithEmail(env.DB, claims.email, { displayName: claims.name });
}

export async function logoutSession(db: D1Database, sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
}

export async function updateDisplayName(
  db: D1Database,
  userId: string,
  displayNameRaw: string,
): Promise<User | { error: string; status: number }> {
  const displayName = normalizeDisplayName(displayNameRaw);
  if (!displayName) {
    return { error: "Display name must be 1–40 characters", status: 400 };
  }

  await db
    .prepare(`UPDATE users SET display_name = ? WHERE id = ?`)
    .bind(displayName, userId)
    .run();

  const row = await db
    .prepare(`SELECT id, email, display_name, created_at FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ id: string; email: string; display_name: string | null; created_at: string }>();

  if (!row) return { error: "User not found", status: 404 };

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export async function claimAnonymousStars(
  db: D1Database,
  userId: string,
  anonymousPlayerId: string,
): Promise<{ claimed: number } | { error: string; status: number }> {
  if (!anonymousPlayerId || anonymousPlayerId === userId) {
    return { claimed: 0 };
  }

  const existing = await db
    .prepare(`SELECT user_id FROM player_claims WHERE anonymous_player_id = ?`)
    .bind(anonymousPlayerId)
    .first<{ user_id: string }>();

  if (existing) {
    if (existing.user_id !== userId) {
      return { error: "This browser identity was already claimed by another account", status: 409 };
    }
    return { claimed: 0 };
  }

  const stars = await db
    .prepare(`SELECT title_id, line_index, starred_at FROM stars WHERE player_id = ?`)
    .bind(anonymousPlayerId)
    .all<{ title_id: string; line_index: number; starred_at: string }>();

  let claimed = 0;
  for (const star of stars.results ?? []) {
    await db
      .prepare(
        `INSERT INTO stars (title_id, line_index, player_id, starred_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(title_id, line_index, player_id) DO NOTHING`,
      )
      .bind(star.title_id, star.line_index, userId, star.starred_at)
      .run();
    claimed += 1;
  }

  await db
    .prepare(`DELETE FROM stars WHERE player_id = ?`)
    .bind(anonymousPlayerId)
    .run();

  await db
    .prepare(
      `INSERT INTO player_claims (anonymous_player_id, user_id, claimed_at)
       VALUES (?, ?, ?)`,
    )
    .bind(anonymousPlayerId, userId, new Date().toISOString())
    .run();

  return { claimed };
}
