import {
  claimAnonymousStars,
  getBearerToken,
  getSessionUser,
  logoutSession,
  requestMagicLink,
  signInWithGoogle,
  updateDisplayName,
  verifyMagicToken,
  type AuthEnv,
  type User,
} from "./auth.js";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins } from "./cors.js";
import { isValidPlayerId } from "./stars.js";
import {
  createAnalogyPack,
  getAnalogyPack,
  listAnalogyConnections,
  listMyAnalogyPacks,
  listParallelInbox,
  proposeCatalogConnection,
  proposeRewriteConnection,
  upvoteConnection,
} from "./parallels.js";
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
  parseLoveBody,
  parseStarBody,
  putStar,
  setLoved,
} from "./stars.js";
import {
  fetchPlayedStats,
  fetchTitleStats,
  insertRun,
  isRunId,
  isTitleId,
  listMyRuns,
  parseRunBody,
  parseThumb,
  rateRun,
  shareCompletedRun,
} from "./runs.js";
import { fetchOwnerCatalogStats, isOwnerEmail } from "./ops.js";
import {
  acceptInvite,
  blockUser,
  getOrCreateInvite,
  listFriends,
  normalizeInviteToken,
  previewInvite,
  rotateInvite,
  unfriend,
} from "./friends.js";
import { copyLineShare, listInbox, sendLineToFriend, sendLineToGroup } from "./inbox.js";
import {
  listChatThreads,
  listDmMessages,
  listGroupMessages,
  markDmRead,
  markGroupRead,
} from "./chats.js";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listGroups,
  removeGroupMember,
} from "./groups.js";

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
    if (request.method === "GET" && pathname === "/api/auth/config") {
      const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || null;
      return jsonResponse({ googleClientId }, 200, origin, allowed);
    }

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

    if (request.method === "POST" && pathname === "/api/auth/google") {
      const body = (await readJson(request)) as { idToken?: string; credential?: string } | null;
      const idToken = body?.idToken ?? body?.credential;
      if (!idToken || typeof idToken !== "string") {
        return errorResponse("Missing Google credential", 400, origin, allowed);
      }
      const result = await signInWithGoogle(env, idToken);
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

  // --- Friends (invite links; no user directory) ---
  if (pathname.startsWith("/api/friends")) {
    const previewMatch = pathname.match(/^\/api\/friends\/invite\/([^/]+)$/);
    if (request.method === "GET" && previewMatch?.[1]) {
      const token = decodeURIComponent(previewMatch[1]);
      if (!normalizeInviteToken(token)) return errorResponse("Invalid invite", 400, origin, allowed);
      const viewer = await getSessionUser(env.DB, getBearerToken(request));
      const result = await previewInvite(env.DB, token, viewer);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;
    const user = userOrError;
    const appOrigin = resolveShareOrigin(env.APP_ORIGIN, origin, allowed);

    if (request.method === "POST" && pathname === "/api/friends/invite") {
      const result = await getOrCreateInvite(env.DB, user, appOrigin);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/friends/invite/rotate") {
      const result = await rotateInvite(env.DB, user, appOrigin);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/friends/accept") {
      const body = (await readJson(request)) as { token?: string } | null;
      if (typeof body?.token !== "string") return errorResponse("Missing token", 400, origin, allowed);
      const result = await acceptInvite(env.DB, user, body.token);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    if (request.method === "GET" && pathname === "/api/friends") {
      const friends = await listFriends(env.DB, user.id);
      return jsonResponse({ friends }, 200, origin, allowed);
    }

    const memberMatch = pathname.match(/^\/api\/friends\/([^/]+)(?:\/(block))?$/);
    if (memberMatch?.[1] && memberMatch[1] !== "invite" && memberMatch[1] !== "accept") {
      const otherId = decodeURIComponent(memberMatch[1]);
      if (request.method === "DELETE" && !memberMatch[2]) {
        const result = await unfriend(env.DB, user.id, otherId);
        if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
        return jsonResponse({ ok: true }, 200, origin, allowed);
      }
      if (request.method === "POST" && memberMatch[2] === "block") {
        const result = await blockUser(env.DB, user, otherId);
        if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
        return jsonResponse({ ok: true }, 200, origin, allowed);
      }
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  // --- Groups (owner manages; members can list + send in Chats) ---
  if (pathname.startsWith("/api/groups")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;
    const user = userOrError;

    if (request.method === "GET" && pathname === "/api/groups") {
      const groups = await listGroups(env.DB, user.id);
      return jsonResponse({ groups }, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/groups") {
      const body = (await readJson(request)) as { name?: string } | null;
      if (typeof body?.name !== "string") return errorResponse("Missing name", 400, origin, allowed);
      const result = await createGroup(env.DB, user, body.name);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    const memberDeleteMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
    if (memberDeleteMatch?.[1] && memberDeleteMatch[2] && request.method === "DELETE") {
      const result = await removeGroupMember(
        env.DB,
        user,
        decodeURIComponent(memberDeleteMatch[1]),
        decodeURIComponent(memberDeleteMatch[2]),
      );
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    const memberAddMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members$/);
    if (memberAddMatch?.[1] && request.method === "POST") {
      const body = (await readJson(request)) as { userId?: string } | null;
      if (typeof body?.userId !== "string") return errorResponse("Missing userId", 400, origin, allowed);
      const result = await addGroupMember(env.DB, user, decodeURIComponent(memberAddMatch[1]), body.userId);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (groupMatch?.[1] && request.method === "DELETE") {
      const result = await deleteGroup(env.DB, user, decodeURIComponent(groupMatch[1]));
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  // --- Chats (DM + shared group threads over line_inbox) ---
  if (pathname.startsWith("/api/chats")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;
    const user = userOrError;

    if (request.method === "GET" && pathname === "/api/chats") {
      const threads = await listChatThreads(env.DB, user.id);
      return jsonResponse({ threads }, 200, origin, allowed);
    }

    const dmReadMatch = pathname.match(/^\/api\/chats\/dm\/([^/]+)\/read$/);
    if (dmReadMatch?.[1] && request.method === "POST") {
      const result = await markDmRead(env.DB, user, decodeURIComponent(dmReadMatch[1]));
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    const dmMatch = pathname.match(/^\/api\/chats\/dm\/([^/]+)$/);
    if (dmMatch?.[1] && request.method === "GET") {
      const result = await listDmMessages(env.DB, user, decodeURIComponent(dmMatch[1]));
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    const groupReadMatch = pathname.match(/^\/api\/chats\/group\/([^/]+)\/read$/);
    if (groupReadMatch?.[1] && request.method === "POST") {
      const result = await markGroupRead(env.DB, user, decodeURIComponent(groupReadMatch[1]));
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    const groupMatch = pathname.match(/^\/api\/chats\/group\/([^/]+)$/);
    if (groupMatch?.[1] && request.method === "GET") {
      const result = await listGroupMessages(env.DB, user, decodeURIComponent(groupMatch[1]));
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  // --- Inbox (one-line sends; no user directory) ---
  if (pathname.startsWith("/api/inbox")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;
    const user = userOrError;
    const appOrigin = resolveShareOrigin(env.APP_ORIGIN, origin, allowed);

    if (request.method === "POST" && pathname === "/api/inbox/share") {
      const body = (await readJson(request)) as { titleId?: string; lineIndex?: number } | null;
      if (typeof body?.titleId !== "string") return errorResponse("Missing titleId", 400, origin, allowed);
      const result = await copyLineShare(env.DB, user, appOrigin, body.titleId, body.lineIndex);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/inbox") {
      const body = (await readJson(request)) as {
        titleId?: string;
        lineIndex?: number;
        toUserId?: string;
        groupId?: string;
      } | null;
      if (typeof body?.titleId !== "string") {
        return errorResponse("Missing titleId", 400, origin, allowed);
      }
      if (typeof body.groupId === "string" && typeof body.toUserId === "string") {
        return errorResponse("Send to a group or a friend, not both", 400, origin, allowed);
      }
      if (typeof body.groupId === "string") {
        const result = await sendLineToGroup(
          env.DB,
          user,
          appOrigin,
          body.titleId,
          body.lineIndex,
          body.groupId,
        );
        if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
        return jsonResponse(result, 200, origin, allowed);
      }
      if (typeof body.toUserId !== "string") {
        return errorResponse("Missing toUserId or groupId", 400, origin, allowed);
      }
      const result = await sendLineToFriend(
        env.DB,
        user,
        appOrigin,
        body.titleId,
        body.lineIndex,
        body.toUserId,
      );
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    if (request.method === "GET" && pathname === "/api/inbox") {
      const items = await listInbox(env.DB, user.id);
      const parallels = await listParallelInbox(env.DB, user.id);
      return jsonResponse({ items, parallels }, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  // --- Quote parallels (Light: packs + catalog connections + upvotes) ---
  if (pathname.startsWith("/api/parallels")) {
    if (request.method === "GET" && pathname === "/api/parallels/mine") {
      const userOrError = await requireUser(request, env, origin, allowed);
      if (userOrError instanceof Response) return userOrError;
      const packs = await listMyAnalogyPacks(env.DB, userOrError.id);
      return jsonResponse({ packs }, 200, origin, allowed);
    }

    if (request.method === "POST" && pathname === "/api/parallels") {
      const userOrError = await requireUser(request, env, origin, allowed);
      if (userOrError instanceof Response) return userOrError;
      const body = (await readJson(request)) as {
        titleId?: string;
        lineIndices?: unknown;
        name?: unknown;
      } | null;
      const result = await createAnalogyPack(env.DB, userOrError, body ?? {});
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      const appOrigin = resolveShareOrigin(env.APP_ORIGIN, origin, allowed);
      return jsonResponse(
        {
          pack: result,
          url: `${appOrigin}/#/parallel/${result.id}`,
          playUrl: `${appOrigin}/#/play/${result.shareId}`,
        },
        200,
        origin,
        allowed,
      );
    }

    const voteMatch = pathname.match(/^\/api\/parallels\/connections\/([^/]+)\/vote$/);
    if (request.method === "POST" && voteMatch?.[1]) {
      const userOrError = await requireUser(request, env, origin, allowed);
      if (userOrError instanceof Response) return userOrError;
      const connectionId = decodeURIComponent(voteMatch[1]);
      const result = await upvoteConnection(env.DB, userOrError, connectionId);
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse(result, 200, origin, allowed);
    }

    const connMatch = pathname.match(/^\/api\/parallels\/([^/]+)\/connections$/);
    if (request.method === "POST" && connMatch?.[1]) {
      const userOrError = await requireUser(request, env, origin, allowed);
      if (userOrError instanceof Response) return userOrError;
      const packId = decodeURIComponent(connMatch[1]);
      const body = (await readJson(request)) as {
        kind?: unknown;
        titleId?: string;
        lineIndices?: unknown;
        note?: unknown;
        context?: unknown;
        text?: unknown;
        toUserIds?: unknown;
        toGroupIds?: unknown;
      } | null;
      const result =
        body?.kind === "rewrite"
          ? await proposeRewriteConnection(env.DB, userOrError, packId, body)
          : await proposeCatalogConnection(env.DB, userOrError, packId, body ?? {});
      if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
      return jsonResponse({ connection: result }, 200, origin, allowed);
    }

    const packMatch = pathname.match(/^\/api\/parallels\/([^/]+)$/);
    if (request.method === "GET" && packMatch?.[1] && packMatch[1] !== "mine") {
      const packId = decodeURIComponent(packMatch[1]);
      const pack = await getAnalogyPack(env.DB, packId);
      if (!pack) return errorResponse("Pack not found", 404, origin, allowed);
      const viewer = await getSessionUser(env.DB, getBearerToken(request));
      const connections = await listAnalogyConnections(env.DB, packId, viewer?.id ?? null);
      return jsonResponse({ pack, connections }, 200, origin, allowed);
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

    if (request.method === "GET" && pathname === "/api/stats/title") {
      const titleId = url.searchParams.get("titleId")?.trim() ?? "";
      if (!isTitleId(titleId)) {
        return errorResponse("Missing or invalid titleId", 400, origin, allowed);
      }
      const stats = await fetchTitleStats(env.DB, titleId);
      return jsonResponse(stats, 200, origin, allowed);
    }

    return errorResponse("Not found", 404, origin, allowed);
  }

  if (pathname.startsWith("/api/ops")) {
    const userOrError = await requireUser(request, env, origin, allowed);
    if (userOrError instanceof Response) return userOrError;

    if (!isOwnerEmail(userOrError.email)) {
      return errorResponse("Forbidden", 403, origin, allowed);
    }

    if (request.method === "GET" && pathname === "/api/ops/catalog") {
      const titles = await fetchOwnerCatalogStats(env.DB, userOrError.id);
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

    const stars = await fetchMyStars(env.DB, playerId, titleId);
    return jsonResponse(
      {
        stars,
        lineIndices: stars.map((s) => s.lineIndex),
        lovedIndices: stars.filter((s) => s.loved).map((s) => s.lineIndex),
      },
      200,
      origin,
      allowed,
    );
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

  if (request.method === "PUT" && pathname === "/api/stars/love") {
    const playerId = await resolveStarPlayerId(request, env);
    if (!playerId) {
      return errorResponse("Unauthorized or missing player id", 401, origin, allowed);
    }
    const body = await readJson(request);
    const loveBody = parseLoveBody(body);
    if (!loveBody) {
      return errorResponse(
        "Invalid body: expected { titleId, lineIndex, loved }",
        400,
        origin,
        allowed,
      );
    }
    const result = await setLoved(env.DB, playerId, loveBody);
    if ("error" in result) return errorResponse(result.error, result.status, origin, allowed);
    return jsonResponse({ ok: true }, 200, origin, allowed);
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
