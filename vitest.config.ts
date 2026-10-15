import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Match tsconfig's "@/*" → "src/*".
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Server modules import "server-only" to stay out of client bundles; tests run them directly.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
});
