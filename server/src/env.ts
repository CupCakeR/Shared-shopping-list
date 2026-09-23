import type { Database } from "bun:sqlite";
import type { User } from "./db";
import type { Events } from "./events";

/** Hono context variables available to every handler. `user` is set by the auth middleware. */
export type Env = { Variables: { db: Database; events: Events; user: User } };
