import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Proxy to the server's PORT from the root .env. Read the file directly: process.env.PORT is Vite's own port.
const envFile = `${import.meta.dirname}/../.env`;
const serverPort = (existsSync(envFile) && parseEnv(readFileSync(envFile, "utf8")).PORT) || "3000";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    preact(),
    tailwindcss(),
    // Our own service worker (src/sw.ts, registered in main.tsx). The plugin adds the file list and the manifest.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      injectManifest: { globPatterns: ["**/*.{html,js,css,woff2,png,svg}"] },
      manifest: {
        name: "Einkaufsliste",
        short_name: "Einkaufsliste",
        lang: "de",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#fafaf9",
        theme_color: "#fafaf9",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          // Full bleed with the bag in the safe zone, so the same image works when masked.
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { proxy: { "/api": `http://127.0.0.1:${serverPort}` } },
});
