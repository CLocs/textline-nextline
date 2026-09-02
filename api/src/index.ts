import { corsHeaders, isAllowedOrigin, parseAllowedOrigins } from "./cors.js";
import {
  deleteStar,
  fetchMyStars,
  fetchPopularStars,
  isValidPlayerId,
  parseStarBody,
  putStar,
} from "./stars.js";

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
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

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowed)) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
  }

  if (!url.pathname.startsWith("/api/stars")) {
    return errorResponse("Not found", 404, origin, allowed);
  }

  if (request.method === "GET" && url.pathname === "/api/stars/mine") {
    const playerId = request.headers.get("X-Player-Id");
    if (!isValidPlayerId(playerId)) {
      return errorResponse("Missing or invalid X-Player-Id", 400, origin, allowed);
    }

    const titleId = url.searchParams.get("titleId")?.trim();
    if (!titleId) {
      return errorResponse("Missing titleId", 400, origin, allowed);
    }

    const lineIndices = await fetchMyStars(env.DB, playerId, titleId);
    return jsonResponse({ lineIndices }, 200, origin, allowed);
  }

  if (request.method === "GET" && url.pathname === "/api/stars/popular") {
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
    if (url.pathname !== "/api/stars") {
      return errorResponse("Not found", 404, origin, allowed);
    }

    const playerId = request.headers.get("X-Player-Id");
    if (!isValidPlayerId(playerId)) {
      return errorResponse("Missing or invalid X-Player-Id", 400, origin, allowed);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400, origin, allowed);
    }

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
