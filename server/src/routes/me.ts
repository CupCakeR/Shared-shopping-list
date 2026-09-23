import type { Context } from "hono";
import { listUsers } from "../db";
import type { Env } from "../env";

export const me = (c: Context<Env>) => c.json({ user: c.get("user"), users: listUsers(c.get("db")) });
