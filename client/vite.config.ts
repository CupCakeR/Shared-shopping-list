import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vite";

// Proxy to the server's PORT from the root .env. Read the file directly: process.env.PORT is Vite's own port.
const envFile = `${import.meta.dirname}/../.env`;
const serverPort = (existsSync(envFile) && parseEnv(readFileSync(envFile, "utf8")).PORT) || "3000";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact(), tailwindcss()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { proxy: { "/api": `http://127.0.0.1:${serverPort}` } },
});
