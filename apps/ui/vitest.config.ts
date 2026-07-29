import { fileURLToPath, URL } from "url";
import { defineConfig } from "vitest/config";

// Standalone from vite.config.ts on purpose — the app's config pulls in the
// TanStack Start/Nitro plugins, which assume a dev-server/build context that
// isn't present when running vitest directly.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
});
