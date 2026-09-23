export interface UserConfig {
  id: string;
  name: string;
  key: string;
}

export interface Config {
  port: number;
  dbPath: string;
  clientDir: string;
  users: UserConfig[];
}

/** Parses `USERS="Tom:key1,Partner:key2"`. The id is the lowercased name. */
export function parseUsers(raw: string): UserConfig[] {
  const users = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      if (sep <= 0 || sep === entry.length - 1) {
        throw new Error(`USERS: expected "Name:key", got "${entry}"`);
      }
      const name = entry.slice(0, sep).trim();
      const key = entry.slice(sep + 1).trim();
      return { id: name.toLowerCase(), name, key };
    });

  if (users.length === 0) throw new Error("USERS: at least one user is required");
  if (new Set(users.map((u) => u.id)).size !== users.length) throw new Error("USERS: duplicate name");
  if (new Set(users.map((u) => u.key)).size !== users.length) throw new Error("USERS: duplicate key");
  return users;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./data/db.sqlite",
    clientDir: env.CLIENT_DIR ?? "./dist",
    users: parseUsers(env.USERS ?? ""),
  };
}
