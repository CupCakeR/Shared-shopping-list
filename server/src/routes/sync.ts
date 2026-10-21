import type { Context } from "hono";
import type { Env } from "../env";
import { ValidationError, applySync, parseSyncRequest } from "../sync";

export const sync = async (c: Context<Env>) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("body must be valid JSON");
  });
  const user = c.get("user");
  const { response, changed, added } = applySync(c.get("db"), user.id, parseSyncRequest(body));
  if (changed) c.get("events").publish(response.rev);
  c.get("push").itemsAdded(user.id, added);
  return c.json(response);
};
