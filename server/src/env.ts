import type { Database } from "bun:sqlite";
import type { User } from "./db";

/** Hono context variables available to every handler. `user` is set by the auth middleware. */
export type Env = { Variables: { db: Database; user: User } };
