import type { Context } from "hono";
import type { Env } from "../env";
import { ValidationError, applySync, parseSyncRequest } from "../sync";

export const sync = async (c: Context<Env>) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("body must be valid JSON");
  });
  const { response, changed } = applySync(c.get("db"), c.get("user").id, parseSyncRequest(body));
  if (changed) c.get("events").publish(response.rev);
  return c.json(response);
};
