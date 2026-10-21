import type { Database } from "bun:sqlite";
import type { User } from "./db";
import type { Events } from "./events";
import type { Push } from "./push";

/** Hono context variables available to every handler. `user` is set by the auth middleware. */
export type Env = { Variables: { db: Database; events: Events; push: Push; user: User } };
