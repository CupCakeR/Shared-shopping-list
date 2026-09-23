import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb, syncUsers } from "./db";

const config = loadConfig();
const db = openDb(config.dbPath);
syncUsers(db, config.users);

const app = createApp(db);
console.log(`listening on :${config.port} (db: ${config.dbPath}, users: ${config.users.map((u) => u.name).join(", ")})`);

export default { port: config.port, fetch: app.fetch };
