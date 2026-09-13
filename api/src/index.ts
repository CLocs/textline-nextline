import {
  claimAnonymousStars,
  getBearerToken,
  getSessionUser,
  logoutSession,
  requestMagicLink,
  updateDisplayName,
  verifyMagicToken,
  type AuthEnv,
  type User,
} from "./auth.js";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins } from "./cors.js";
import { isValidPlayerId } from "./stars.js";
import {
  createShare,
  getShareMeta,
  getShareQueue,
  listSharedRuns,
  upsertSharedRun,
} from "./shares.js";
import {
  deleteStar,
  fetchMyStars,
  fetchPopularStars,
  parseStarBody,
  putStar,
} from "./stars.js";
import {
  fetchPlayedStats,
  insertRun,
  isRunId,
  listMyRuns,
  parseRunBody,
  parseThumb,
  rateRun,
  shareCompletedRun,
} from "./runs.js";

function resolveShareOrigin(
  appOrigin: string | undefined,
  requestOrigin: string | null,
  allowed: string[],
): string {
  const fallback = (appOrigin ?? "http://localhost:5173").replace(/\/$/, "");
  if (requestOrigin && isAllowedOrigin(requestOrigin, allowed)) {
    return requestOrigin.replace(/\/$/, "");
  }
  return fallback;
}
export interface Env extends AuthEnv {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  APP_ORIGIN?: string;
}

function jsonResponse(
  data: unknown,
  status: number,
  origin: string | null,
  allowed: string[],
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin, allowed),
    },
  });
}

function errorResponse(
  message: string,
  status: number,
  origin: string | null,
  allowed: string[],
): Response {
  return jsonResponse({ error: message }, status, origin, allowed);
}

async function requireUser(
  request: Request,
  env: Env,
  origin: string | null,
  allowed: string[],
): Promise<User | Response> {
  const sessionId = getBearerToken(request);
  const user = await getSessionUser(env.DB, sessionId);
  if (!user) return errorResponse("Unauthorized", 401, origin, allowed);
  return user;
}

/** Prefer logged-in user id; fall back to anonymous X-Player-Id for stars. */
async function resolveStarPlayerId(
  request: Request,
  env: Env,
): Promise<string | null> {
  const sessionUser = await getSessionUser(env.DB, getBearerToken(request));
  if (sessionUser) return sessionUser.id;

  const playerId = request.headers.get("X-Player-Id");
  return isValidPlayerId(playerId) ? playerId : null;
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowed)) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
  }

  // --- Auth ---
  if (pathname.startsWith("/api/auth")) {
    if (request.method === "POST" && pathname === "/api/auth/request-link") {
      const body = (await readJson(request)) as { email?: string; returnTo?: string } | null;
      if (!body?.email) return errorResponse("Missing email", 400, origin, allowed);
      const result = await requestMagicLink(env, body.email, {
        linkOrigin: origin,
        allowedOrigins: allowed,
        returnTo: body.returnTo,
      });
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/auth/verify") {
      const body = (await readJson(request)) as { token?: string } | null;
      if (!body?.token) return errorResponse("Missing token", 400, origin, allowed);
      const result = await verifyMagicToken(env.DB, body.token);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(
        { user: result.user, sessionToken: result.sessionToken },
        200,
        origin,
        allowed,
      );
    }

    if (request.method === "GET" && pathname === "/api/auth/me") {
      const user = await requireUser(request, env, origin, allowed);
      if (user instanceof Response) return user;
      return jsonResponse({ user }, 200, origin, allowed);
    }

    if (request.method === "PATCH" && pathname === "/api/auth/me") {
      const user = await requireUser(request, env, origin, allowed);
      if (user instanceof Response) return user;
      const body = (await readJson(request)) as { displayName?: string } | null;
      if (typeof body?.displayName !== "string") {
        return errorResponse("Missing displayName", 400, origin, allowed);
      }
      const result = await updateDisplayName(env.DB, user.id, body.displayName);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ user: result }, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      await logoutSession(env.DB, getBearerToken(request));
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/auth/claim") {
      const user = await requireUser(request, env, origin, allowed);
      if (user instanceof Response) return user;
      const body = (await readJson(request)) as { anonymousPlayerId?: string } | null;
      if (!body?.anonymousPlayerId || !isValidPlayerId(body.anonymousPlayerId)) {
        return errorResponse("Missing or invalid anonymousPlayerId", 400, origin, allowed);
      }
      const result = await claimAnonymousStars(env.DB, user.id, body.anonymousPlayerId);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ claimed: result.claimed }, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  // --- Shares ---
  if (pathname.startsWith("/api/shares")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;
    const user = userOrError;

    if (request.method === "POST" && pathname === "/api/shares") {
      const body = (await readJson(request)) as { titleId?: string } | null;
      const titleId = body?.titleId?.trim();
      if (!titleId) return errorResponse("Missing titleId", 400, origin, allowed);
      const share = await createShare(env.DB, user, titleId);
      const appOrigin = resolveShareOrigin(env.APP_ORIGIN, origin, allowed);
      return jsonResponse(
        {
          shareId: share.id,
          url: `${appOrigin}/#/play/${share.id}`,
        },
        200,
        origin,
        allowed,
      );
    }

    const shareMatch = pathname.match(/^\/api\/shares\/([^/]+)(?:\/(queue|runs))?$/);
    if (!shareMatch) return errorResponse("Not found", 404, origin, allowed);
    const shareId = decodeURIComponent(shareMatch[1]!);
    const sub = shareMatch[2];

    if (request.method === "GET" && !sub) {
      const meta = await getShareMeta(env.DB, shareId);
      if (!meta) return errorResponse("Share not found", 404, origin, allowed);
      return jsonResponse({ share: meta }, 200, origin, allowed);
    }

    if (request.method === "GET" && sub === "queue") {
      const queue = await getShareQueue(env.DB, shareId);
      if (!queue) return errorResponse("Share not found", 404, origin, allowed);
      return jsonResponse(queue, 200, origin, allowed);
    }

    if (request.method === "POST" && sub === "runs") {
      const body = (await readJson(request)) as {
        correctCount?: number;
        wrongCount?: number;
        skipCount?: number;
      } | null;
      if (
        !body ||
        typeof body.correctCount !== "number" ||
        typeof body.wrongCount !== "number" ||
        typeof body.skipCount !== "number"
      ) {
        return errorResponse(
          "Invalid body: expected { correctCount, wrongCount, skipCount }",
          400,
          origin,
          allowed,
        );
      }
      const result = await upsertSharedRun(env.DB, shareId, user, {
        correctCount: body.correctCount,
        wrongCount: body.wrongCount,
        skipCount: body.skipCount,
      });
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    if (request.method === "GET" && sub === "runs") {
      const meta = await getShareMeta(env.DB, shareId);
      if (!meta) return errorResponse("Share not found", 404, origin, allowed);
      const runs = await listSharedRuns(env.DB, shareId);
      return jsonResponse({ runs }, 200, origin, allowed);
    }

    return errorResponse("Method not allowed", 405, origin, allowed);
  }

  // --- Runs (Phase 2.5) ---
  if (pathname.startsWith("/api/runs")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;
    const user = userOrError;

    if (request.method === "POST" && pathname === "/api/runs") {
      const body = parseRunBody(await readJson(request));
      if (!body) {
        return errorResponse(
          "Invalid body: expected { id, titleId, length, mode, correctCount, wrongCount, skipCount, questionTotal, endReason }",
          400,
          origin,
          allowed,
        );
      }
      await insertRun(env.DB, user, body);
      return jsonResponse({ ok: true, id: body.id }, 200, origin, allowed);
    }

    if (request.method === "GET" && pathname === "/api/runs/mine") {
      const runs = await listMyRuns(env.DB, user.id);
      return jsonResponse({ runs }, 200, origin, allowed);
    }

    const shareFromRun = pathname.match(/^\/api\/runs\/([^/]+)\/share$/);
    if (request.method === "POST" && shareFromRun?.[1]) {
      const runId = decodeURIComponent(shareFromRun[1]);
      if (!isRunId(runId)) return errorResponse("Invalid run id", 400, origin, allowed);
      const result = await shareCompletedRun(env.DB, user, runId);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      const appOrigin = resolveShareOrigin(env.APP_ORIGIN, origin, allowed);
      return jsonResponse(
        {
          shareId: result.shareId,
          url: `${appOrigin}/#/play/${result.shareId}`,
        },
        200,
        origin,
        allowed,
      );
    }

    const ratingMatch = pathname.match(/^\/api\/runs\/([^/]+)\/rating$/);
    if (request.method === "PATCH" && ratingMatch?.[1]) {
      const runId = decodeURIComponent(ratingMatch[1]);
      if (!isRunId(runId)) return errorResponse("Invalid run id", 400, origin, allowed);
      const thumb = parseThumb(await readJson(request));
      if (!thumb) {
        return errorResponse('Invalid body: expected { thumb: "up" | "down" }', 400, origin, allowed);
      }
      const result = await rateRun(env.DB, user, runId, thumb);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  if (pathname.startsWith("/api/stats")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;

    if (request.method === "GET" && pathname === "/api/stats/played") {
      const titles = await fetchPlayedStats(env.DB);
      return jsonResponse({ titles }, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  // --- Stars ---
  if (!pathname.startsWith("/api/stars")) {
    return errorResponse("Not found", 404, origin, allowed);
  }

  if (request.method === "GET" && pathname === "/api/stars/mine") {
    const playerId = await resolveStarPlayerId(request, env);
    if (!playerId) {
      return errorResponse("Unauthorized or missing player id", 401, origin, allowed);
    }

    const titleId = url.searchParams.get("titleId")?.trim();
    if (!titleId) {
      return errorResponse("Missing titleId", 400, origin, allowed);
    }

    const lineIndices = await fetchMyStars(env.DB, playerId, titleId);
    return jsonResponse({ lineIndices }, 200, origin, allowed);
  }

  if (request.method === "GET" && pathname === "/api/stars/popular") {
    const titleId = url.searchParams.get("titleId")?.trim();
    if (!titleId) {
      return errorResponse("Missing titleId", 400, origin, allowed);
    }

    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
      return errorResponse("Invalid limit", 400, origin, allowed);
    }

    const popular = await fetchPopularStars(env.DB, titleId, limit);
    return jsonResponse({ popular }, 200, origin, allowed);
  }

  if (request.method === "PUT" || request.method === "DELETE") {
    if (pathname !== "/api/stars") {
      return errorResponse("Not found", 404, origin, allowed);
    }

    const playerId = await resolveStarPlayerId(request, env);
    if (!playerId) {
      return errorResponse("Unauthorized or missing player id", 401, origin, allowed);
    }

    const body = await readJson(request);
    const starBody = parseStarBody(body);
    if (!starBody) {
      return errorResponse("Invalid body: expected { titleId, lineIndex }", 400, origin, allowed);
    }

    if (request.method === "PUT") {
      await putStar(env.DB, playerId, starBody);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    await deleteStar(env.DB, playerId, starBody);
    return jsonResponse({ ok: true }, 200, origin, allowed);
  }

  return errorResponse("Method not allowed", 405, origin, allowed);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(error);
      const origin = request.headers.get("Origin");
      const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
      return errorResponse("Internal server error", 500, origin, allowed);
    }
  },
};
