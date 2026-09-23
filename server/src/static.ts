import type { Context } from "hono";
import { serveStatic } from "hono/bun";
import type { Env } from "./env";

/** Hashed file names never change. Everything else (index.html, sw.js, icons) is revalidated, or updates get stuck. */
function cacheHeaders(path: string, c: Context<Env>) {
  c.header("Cache-Control", /\/assets\/[^/]+$/.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
}

/** The built client from `dir`. Paths without a file outside /api get index.html, the client routes itself. */
export function serveClient(dir: string) {
  const files = serveStatic<Env>({ root: dir, onFound: cacheHeaders });
  const shell = serveStatic<Env>({ root: dir, path: "index.html", onFound: cacheHeaders });
  return [files, (c: Context<Env>, next: () => Promise<void>) => (c.req.path.startsWith("/api/") ? next() : shell(c, next))] as const;
}
