import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Item, List, Op } from "../../shared/types";

/**
 * A pending change. Keyed by `table:id`, so repeated edits of one row collapse into its latest version.
 * `v` changes on every edit: after a sync, an entry is only removed if it wasn't edited again meanwhile.
 */
export interface OutboxEntry {
  key: string;
  op: Op;
  v: string;
}

interface Schema extends DBSchema {
  lists: { key: string; value: List };
  items: { key: string; value: Item };
  outbox: { key: string; value: OutboxEntry };
  meta: { key: string; value: number };
}

export type LocalDb = IDBPDatabase<Schema>;

export const outboxKey = (op: Op) => `${op.table}:${op.row.id}`;

export function openLocal(): Promise<LocalDb> {
  return openDB<Schema>("shopping", 1, {
    upgrade(db) {
      db.createObjectStore("lists", { keyPath: "id" });
      db.createObjectStore("items", { keyPath: "id" });
      db.createObjectStore("outbox", { keyPath: "key" });
      db.createObjectStore("meta");
    },
  });
}
