import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" — assets resolve RELATIVE to the served page (/plugins/promptlab/view),
// so the same build works on the host window and behind the /agents/<slug>/ fleet
// proxy (the agent-browser lesson: never root-absolute in a sub-path-served SPA).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../static",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
  },
});
