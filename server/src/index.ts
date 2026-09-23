import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb, syncUsers } from "./db";

const config = loadConfig();
const db = openDb(config.dbPath);
syncUsers(db, config.users);

const app = createApp(db, { clientDir: config.clientDir });
console.log(`listening on :${config.port} (db: ${config.dbPath}, users: ${config.users.map((u) => u.name).join(", ")})`);

// Bun closes connections after 10 s without traffic by default. Keep that above the SSE heartbeat.
export default { port: config.port, fetch: app.fetch, idleTimeout: 60 };
