import { createReadStream, existsSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PreviewServer, ViteDevServer } from "vite";
import {
  createStudioContext,
  listStudioShows,
  studioApprove,
  studioEpisode,
  studioExtract,
  studioHealth,
  parseStudioVotes,
  studioCoverage,
  clearStudioExtractProgress,
  studioExtractProgress,
  studioOpenPreview,
  startStudioPush,
  studioPushStatus,
  studioQueue,
} from "./stillsStudioActions.js";
import type { StudioExtractMode } from "./stillsStudioTypes.js";
import { DEFAULT_STUDIO_SHOW } from "./stillsStudioTypes.js";

const PREFIX = "/api/stills-studio";
const MAX_CONCURRENT_EXTRACTS = 10;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseMode(raw: unknown): StudioExtractMode {
  if (
    raw === "retry" ||
    raw === "batch" ||
    raw === "lines" ||
    raw === "handful" ||
    raw === "smart" ||
    raw === "shuffle"
  ) {
    return raw;
  }
  return "handful";
}

export function stillsStudioPlugin() {
  const packageRoot = process.cwd();
  const ctx = createStudioContext(packageRoot);
  const extracting = new Set<string>();

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(req.url ?? "", "http://studio.local");
    if (!url.pathname.startsWith(PREFIX)) {
      next();
      return;
    }

    const path = url.pathname.slice(PREFIX.length) || "/";
    try {
      if (req.method === "GET" && path === "/health") {
        sendJson(res, 200, studioHealth());
        return;
      }
      if (req.method === "GET" && path === "/coverage") {
        sendJson(res, 200, studioCoverage(ctx));
        return;
      }
      if (req.method === "GET" && path === "/shows") {
        sendJson(res, 200, listStudioShows(ctx));
        return;
      }
      if (req.method === "GET" && path === "/queue") {
        const show = url.searchParams.get("show") ?? DEFAULT_STUDIO_SHOW;
        sendJson(res, 200, studioQueue(ctx, show));
        return;
      }
      if (req.method === "GET" && path === "/episode") {
        const titleId = url.searchParams.get("titleId") ?? "";
        sendJson(res, 200, studioEpisode(ctx, titleId));
        return;
      }
      if (req.method === "GET" && path === "/push-status") {
        sendJson(res, 200, { job: studioPushStatus() });
        return;
      }
      if (req.method === "GET" && path === "/extract-status") {
        const titleId = url.searchParams.get("titleId") ?? "";
        sendJson(res, 200, { progress: studioExtractProgress(titleId) });
        return;
      }
      if (req.method === "POST" && path === "/open-preview") {
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const titleId = typeof body.titleId === "string" ? body.titleId : "";
        sendJson(res, 200, studioOpenPreview(ctx, titleId));
        return;
      }

      if (req.method === "POST" && path === "/push") {
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const titleId = typeof body.titleId === "string" ? body.titleId : "";
        sendJson(res, 202, { job: startStudioPush(ctx, titleId) });
        return;
      }

      if (req.method === "POST" && (path === "/extract" || path === "/batch" || path === "/approve")) {
        const raw = await readBody(req);
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const titleId = typeof body.titleId === "string" ? body.titleId : "";
        const pushing = studioPushStatus();
        if (pushing?.status === "running" && pushing.titleId === titleId && path !== "/approve") {
          sendJson(res, 409, { error: `Still pushing ${pushing.label} to R2.` });
          return;
        }
        if (path === "/approve") {
          sendJson(res, 200, await studioApprove(ctx, titleId));
          return;
        }
        if (extracting.has(titleId)) {
          sendJson(res, 409, { error: "Already extracting this title." });
          return;
        }
        if (extracting.size >= MAX_CONCURRENT_EXTRACTS) {
          sendJson(res, 409, {
            error: `${MAX_CONCURRENT_EXTRACTS} extracts are already running. Wait for one to finish, then start another.`,
          });
          return;
        }
        extracting.add(titleId);
        try {
          const mode = path === "/batch" ? "batch" : parseMode(body.mode);
          if (mode === "lines" || mode === "batch") {
            req.socket?.setTimeout(0);
            res.setTimeout(0);
          }
          const lineOffsets =
            body.lineOffsets && typeof body.lineOffsets === "object" && !Array.isArray(body.lineOffsets)
              ? (body.lineOffsets as Record<string, number>)
              : undefined;
          sendJson(
            res,
            200,
            await studioExtract(ctx, {
              titleId,
              mode,
              offsetMs: typeof body.offsetMs === "number" ? body.offsetMs : undefined,
              timeScale: typeof body.timeScale === "number" ? body.timeScale : undefined,
              seek: body.seek === "mid" || body.seek === "start" ? body.seek : undefined,
              lineOffsets,
              votes: parseStudioVotes(body.votes),
            }),
          );
        } finally {
          extracting.delete(titleId);
          clearStudioExtractProgress(titleId);
        }
        return;
      }

      sendJson(res, 404, { error: "Unknown stills studio route." });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    name: "stills-studio",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}

/** Serve gitignored quote stills at /stills in `vite` / `vite preview`. */
export function stillsPreviewPlugin() {
  const previewRoot = normalize(join(process.cwd(), "inbox", "stills-preview"));

  function handle(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const raw = req.url ?? "";
    if (!raw.startsWith("/stills/")) {
      next();
      return;
    }
    const rel = decodeURIComponent(raw.slice("/stills/".length).split("?")[0] ?? "");
    const file = normalize(join(previewRoot, rel));
    const inside = relative(previewRoot, file);
    if (inside.startsWith("..") || isAbsolute(inside) || !existsSync(file) || !statSync(file).isFile()) {
      if (/^[a-z0-9-]+\/\d+\.jpe?g$/i.test(rel)) {
        res.statusCode = 404;
        res.setHeader("Cache-Control", "no-store");
        res.end();
        return;
      }
      next();
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    createReadStream(file).pipe(res);
  }

  return {
    name: "stills-preview",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handle);
    },
  };
}
