import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { findUserByKey } from "../db";
import type { Env } from "../env";

export const auth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = key ? findUserByKey(c.get("db"), key) : null;
  if (!user) throw new HTTPException(401, { message: "invalid key" });
  c.set("user", user);
  await next();
});
