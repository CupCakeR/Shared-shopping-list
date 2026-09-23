import type { Context } from "hono";
import type { Env } from "../env";

export const health = (c: Context<Env>) => c.json({ ok: true });
