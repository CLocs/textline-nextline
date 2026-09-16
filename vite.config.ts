import { createReadStream, existsSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";
import { defineConfig, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Serve gitignored quote stills at /stills in `vite` / `vite preview`. */
function stillsPreviewPlugin() {
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

export default defineConfig({
  plugins: [react(), stillsPreviewPlugin()],
});
