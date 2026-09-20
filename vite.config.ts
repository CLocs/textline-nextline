import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { stillsPreviewPlugin, stillsStudioPlugin } from "./src/lib/content/stillsStudioPlugin.ts";

export default defineConfig({
  plugins: [react(), stillsStudioPlugin(), stillsPreviewPlugin()],
});
