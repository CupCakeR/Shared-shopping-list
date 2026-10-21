import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./env";
import { Events } from "./events";
import { auth } from "./middleware/auth";
import { events as eventsRoute } from "./routes/events";
import { health } from "./routes/health";
import { me } from "./routes/me";
import { pushInfo, shopping, subscribe, unsubscribe } from "./routes/push";
import { sync } from "./routes/sync";
import { Push } from "./push";
import { serveClient } from "./static";
import { ValidationError } from "./sync";

/**
 * clientDir: the built client (`vite build`), served next to the API. Left out in tests and dev, where Vite serves it.
 * push: left out, push is off.
 */
export function createApp(
  db: Database,
  { events = new Events(), push = new Push(db, null), clientDir }: { events?: Events; push?: Push; clientDir?: string } = {},
) {
  const api = new Hono<Env>()
    .use(auth)
    .get("/me", me)
    .get("/events", eventsRoute)
    .post("/sync", sync)
    .get("/push", pushInfo)
    .post("/push/subscribe", subscribe)
    .post("/push/unsubscribe", unsubscribe)
    .post("/shopping", shopping);

  const app = new Hono<Env>()
    .use(async (c, next) => {
      c.set("db", db);
      c.set("events", events);
      c.set("push", push);
      await next();
    })
    .get("/api/health", health)
    .route("/api", api);
  if (clientDir) app.use(...serveClient(clientDir));

  app.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
