import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { fileURLToPath, URL } from "url";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const COOP_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

const config = defineConfig({
  // Vite-level headers (belt-and-suspenders for non-Nitro assets)
  server: {
    headers: COOP_HEADERS,
  },
  // Nitro-level headers — this is what actually sets headers in dev
  // since Nitro is the HTTP request handler in TanStack Start.
  nitro: {
    routeRules: {
      "/**": { headers: COOP_HEADERS },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  worker: {
    format: "es",
  },
  plugins: [
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // React Compiler. @vitejs/plugin-react 6 dropped its `babel` option (it
    // transforms JSX with oxc now), so the compiler is applied as a separate
    // Rolldown-Babel pass via the plugin's reactCompilerPreset helper.
    // `target` is omitted deliberately — it's only for React 17/18, and this
    // app is on React 19, which is the preset's default.
    babel({ presets: [reactCompilerPreset()] }),
  ],
});

export default config;
