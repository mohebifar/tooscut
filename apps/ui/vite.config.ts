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
  // Nitro-level headers. In dev these are applied by Nitro itself; in
  // production the Vercel preset compiles these routeRules into
  // .vercel/output/config.json, which is what actually serves the site.
  // (Under the Build Output API that generated config is authoritative, so
  // putting these in vercel.json instead does not work.)
  //
  // Getting this wrong is silent locally and fatal in production: a COEP
  // document may only spawn a worker whose own script response also carries a
  // COEP header, otherwise the browser blocks it with ERR_BLOCKED_BY_RESPONSE
  // and the editor hangs on "Initializing GPU...".
  //
  // To check a change here, build with NITRO_PRESET=vercel and read
  // .vercel/output/config.json — the routes are matched first-wins.
  nitro: {
    routeRules: {
      "/**": { headers: COOP_HEADERS },
      // /assets/** needs its own rule even though /** already covers it.
      // Nitro emits a `/assets/(.*)` cache-control route into Vercel's build
      // output config, and Vercel stops at the first matching route — so
      // assets never reached the `/(.*)` rule above and shipped without COEP.
      // Repeating the headers here puts them on the route that actually wins.
      "/assets/**": {
        headers: { ...COOP_HEADERS, "cache-control": "public, max-age=31536000, immutable" },
      },
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
