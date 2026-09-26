import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { stillsPreviewPlugin, stillsStudioPlugin } from "./src/lib/content/stillsStudioPlugin.ts";

export default defineConfig({
  plugins: [react(), stillsStudioPlugin(), stillsPreviewPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");
          const marker = "/content/titles/";
          const at = normalized.lastIndexOf(marker);
          if (at === -1) return;
          const name = normalized.slice(at + marker.length);
          let bucket = 0;
          for (let i = 0; i < name.length; i += 1) bucket = (bucket + name.charCodeAt(i)) % 8;
          return `titles-${bucket}`;
        },
      },
    },
  },
});
