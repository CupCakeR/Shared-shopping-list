import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PushInfo, PushSubscriptionInput } from "../../../shared/types";
import type { Env } from "../env";
import { ValidationError } from "../sync";

async function body(c: Context<Env>): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => null);
  if (typeof b !== "object" || b === null || Array.isArray(b)) throw new ValidationError("body must be a JSON object");
  return b as Record<string, unknown>;
}

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function endpoint(v: unknown): string {
  // Push services are always https. Anything else would make the server send requests wherever a client says.
  if (!isStr(v, 2000) || !v.startsWith("https://")) throw new ValidationError("endpoint must be an https URL");
  return v;
}

function requireEnabled(c: Context<Env>) {
  if (!c.get("push").enabled) throw new HTTPException(503, { message: "push is not configured" });
}

/** The VAPID public key the client subscribes with. */
export const pushInfo = (c: Context<Env>) => c.json<PushInfo>({ publicKey: c.get("push").publicKey });

export const subscribe = async (c: Context<Env>) => {
  requireEnabled(c);
  const b = await body(c);
  const keys = b.keys as Record<string, unknown> | undefined;
  if (!keys || !isStr(keys.p256dh, 200) || !isStr(keys.auth, 100)) throw new ValidationError("keys.p256dh and keys.auth are required");
  const sub: PushSubscriptionInput = { endpoint: endpoint(b.endpoint), keys: { p256dh: keys.p256dh, auth: keys.auth } };
  c.get("push").subscribe(c.get("user").id, sub);
  return c.body(null, 204);
};

export const unsubscribe = async (c: Context<Env>) => {
  c.get("push").unsubscribe(endpoint((await body(c)).endpoint), c.get("user").id);
  return c.body(null, 204);
};

/** "Going shopping": tells everyone else right away. */
export const shopping = async (c: Context<Env>) => {
  requireEnabled(c);
  await c.get("push").goingShopping(c.get("user").id);
  return c.body(null, 204);
};
