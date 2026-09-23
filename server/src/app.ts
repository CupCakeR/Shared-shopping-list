import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./env";
import { Events } from "./events";
import { auth } from "./middleware/auth";
import { events as eventsRoute } from "./routes/events";
import { health } from "./routes/health";
import { me } from "./routes/me";
import { sync } from "./routes/sync";
import { ValidationError } from "./sync";

export function createApp(db: Database, events = new Events()) {
  const api = new Hono<Env>()
    .use(auth)
    .get("/me", me)
    .get("/events", eventsRoute)
    .post("/sync", sync);

  const app = new Hono<Env>()
    .use(async (c, next) => {
      c.set("db", db);
      c.set("events", events);
      await next();
    })
    .get("/api/health", health)
    .route("/api", api);

  app.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
