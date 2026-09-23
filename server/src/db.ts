import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_LIST_ID, type User } from "../../shared/types";
import type { UserConfig } from "./config";

export { DEFAULT_LIST_ID, type User };
export const DEFAULT_LIST_NAME = "Einkaufsliste";

// Append-only. Each entry runs once, tracked via PRAGMA user_version.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    api_key   TEXT UNIQUE            -- NULL = user removed from USERS, can no longer log in
  );

  CREATE TABLE lists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER,
    rev         INTEGER NOT NULL
  );
  CREATE INDEX lists_rev ON lists(rev);

  CREATE TABLE items (
    id          TEXT PRIMARY KEY,
    list_id     TEXT NOT NULL REFERENCES lists(id),
    name        TEXT NOT NULL,
    quantity    TEXT,
    note        TEXT,
    category    TEXT,
    checked     INTEGER NOT NULL DEFAULT 0,
    checked_at  INTEGER,
    added_by    TEXT NOT NULL REFERENCES users(id),
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER,
    rev         INTEGER NOT NULL
  );
  CREATE INDEX items_rev ON items(rev);
  CREATE INDEX items_list ON items(list_id);

  CREATE TABLE push_subs (
    id          INTEGER PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
  INSERT INTO meta (key, value) VALUES ('rev', 0);
  `,
];

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  migrate(db);
  ensureDefaultList(db);
  return db;
}

function migrate(db: Database) {
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v]!);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

function ensureDefaultList(db: Database) {
  const exists = db.query("SELECT 1 FROM lists WHERE id = $id").get({ id: DEFAULT_LIST_ID });
  if (exists) return;
  const now = Date.now();
  db.query(
    `INSERT INTO lists (id, name, is_default, created_at, updated_at, deleted_at, rev)
     VALUES ($id, $name, 1, $now, $now, NULL, $rev)`,
  ).run({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, now, rev: nextRev(db) });
}

/** Makes the users table match USERS. Removed users keep their rows (items reference them) but lose their key. */
export function syncUsers(db: Database, users: UserConfig[]) {
  const upsert = db.query(
    `INSERT INTO users (id, name, api_key) VALUES ($id, $name, $key)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, api_key = excluded.api_key`,
  );
  db.transaction(() => {
    db.run("UPDATE users SET api_key = NULL");
    for (const u of users) upsert.run({ id: u.id, name: u.name, key: u.key });
  })();
}

export function findUserByKey(db: Database, key: string): User | null {
  return db.query("SELECT id, name FROM users WHERE api_key = $key").get({ key }) as User | null;
}

export function listUsers(db: Database): User[] {
  return db.query("SELECT id, name FROM users ORDER BY name").all() as User[];
}

export function currentRev(db: Database): number {
  return (db.query("SELECT value FROM meta WHERE key = 'rev'").get() as { value: number }).value;
}

export function nextRev(db: Database): number {
  return (db.query("UPDATE meta SET value = value + 1 WHERE key = 'rev' RETURNING value").get() as { value: number })
    .value;
}
