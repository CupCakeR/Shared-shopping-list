import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb, syncUsers } from "./db";
import { Push } from "./push";

const config = loadConfig();
const db = openDb(config.dbPath);
syncUsers(db, config.users);

const app = createApp(db, { clientDir: config.clientDir, push: Push.fromVapid(db, config.vapid) });
console.log(`listening on :${config.port} (db: ${config.dbPath}, users: ${config.users.map((u) => u.name).join(", ")})`);
if (!config.vapid) console.log("push is off: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to turn it on");

// Bun closes connections after 10 s without traffic by default. Keep that above the SSE heartbeat.
export default { port: config.port, fetch: app.fetch, idleTimeout: 60 };
