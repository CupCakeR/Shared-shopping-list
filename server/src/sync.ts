import type { Database } from "bun:sqlite";
import type { Item, ItemInput, List, ListInput, Op, Rejected, SyncRequest, SyncResponse } from "../../shared/types";
import { currentRev, nextRev } from "./db";

export type { Item, ItemInput, List, ListInput, Op, Rejected, SyncRequest, SyncResponse };

const MAX_OPS = 1000;
/** Client timestamps further in the future than this are clamped, so a bad clock can't lock a row forever. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export class ValidationError extends Error {}

// --- request validation -----------------------------------------------------

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function str(o: Obj, key: string, path: string, max: number): string {
  const v = o[key];
  if (typeof v !== "string" || v.length === 0 || v.length > max) {
    throw new ValidationError(`${path}.${key} must be a string of 1-${max} chars`);
  }
  return v;
}

function optStr(o: Obj, key: string, path: string, max: number): string | null {
  if (o[key] === undefined || o[key] === null || o[key] === "") return null;
  return str(o, key, path, max);
}

function time(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (!Number.isSafeInteger(v) || (v as number) < 0) {
    throw new ValidationError(`${path}.${key} must be a non-negative integer (ms timestamp)`);
  }
  return v as number;
}

function optTime(o: Obj, key: string, path: string): number | null {
  return o[key] === undefined || o[key] === null ? null : time(o, key, path);
}

function parseOp(op: unknown, path: string): Op {
  if (!isObj(op) || !isObj(op.row)) throw new ValidationError(`${path} must be { table, row }`);
  const r = op.row;
  const p = `${path}.row`;

  if (op.table === "lists") {
    return {
      table: "lists",
      row: {
        id: str(r, "id", p, 64),
        name: str(r, "name", p, 100),
        icon: optStr(r, "icon", p, 32),
        created_at: time(r, "created_at", p),
        updated_at: time(r, "updated_at", p),
        deleted_at: optTime(r, "deleted_at", p),
      },
    };
  }

  if (op.table === "items") {
    if (r.checked !== undefined && typeof r.checked !== "boolean") {
      throw new ValidationError(`${p}.checked must be a boolean`);
    }
    return {
      table: "items",
      row: {
        id: str(r, "id", p, 64),
        list_id: str(r, "list_id", p, 64),
        name: str(r, "name", p, 200),
        quantity: optStr(r, "quantity", p, 50),
        note: optStr(r, "note", p, 1000),
        category: optStr(r, "category", p, 50),
        checked: r.checked === true,
        checked_at: optTime(r, "checked_at", p),
        created_at: time(r, "created_at", p),
        updated_at: time(r, "updated_at", p),
        deleted_at: optTime(r, "deleted_at", p),
      },
    };
  }

  throw new ValidationError(`${path}.table must be "lists" or "items"`);
}

export function parseSyncRequest(body: unknown): SyncRequest {
  if (!isObj(body)) throw new ValidationError("body must be an object");
  const since = body.since ?? 0;
  if (!Number.isSafeInteger(since) || (since as number) < 0) {
    throw new ValidationError("since must be a non-negative integer");
  }
  const ops = body.ops ?? [];
  if (!Array.isArray(ops)) throw new ValidationError("ops must be an array");
  if (ops.length > MAX_OPS) throw new ValidationError(`at most ${MAX_OPS} ops per request`);
  return { since: since as number, ops: ops.map((op, i) => parseOp(op, `ops[${i}]`)) };
}

// --- applying ops -------------------------------------------------------------

type RawList = Omit<List, "is_default"> & { is_default: number };
type RawItem = Omit<Item, "checked"> & { checked: number };

const toList = (r: RawList): List => ({ ...r, is_default: r.is_default === 1 });
const toItem = (r: RawItem): Item => ({ ...r, checked: r.checked === 1 });

/**
 * Applies the client's ops (last-write-wins per row on updated_at) and returns everything
 * that changed after `since`, plus the current server version of every row the client touched.
 * The latter corrects the client's optimistic state when one of its ops lost.
 */
export function applySync(
  db: Database,
  userId: string,
  req: SyncRequest,
  now = Date.now(),
): { response: SyncResponse; changed: boolean } {
  const getListStamp = db.query("SELECT updated_at FROM lists WHERE id = $id");
  const getItemStamp = db.query("SELECT updated_at FROM items WHERE id = $id");
  const listExists = db.query("SELECT 1 FROM lists WHERE id = $id");

  const upsertList = db.query(
    `INSERT INTO lists (id, name, icon, is_default, created_at, updated_at, deleted_at, rev)
     VALUES ($id, $name, $icon, 0, $created_at, $updated_at, $deleted_at, $rev)
     ON CONFLICT(id) DO UPDATE SET
       name       = excluded.name,
       icon       = excluded.icon,
       updated_at = excluded.updated_at,
       deleted_at = CASE WHEN lists.is_default THEN NULL ELSE excluded.deleted_at END,
       rev        = excluded.rev`,
  );

  const upsertItem = db.query(
    `INSERT INTO items (id, list_id, name, quantity, note, category, checked, checked_at, checked_by,
                        added_by, created_at, updated_at, deleted_at, rev)
     VALUES ($id, $list_id, $name, $quantity, $note, $category, $checked, $checked_at, $checked_by,
             $added_by, $created_at, $updated_at, $deleted_at, $rev)
     ON CONFLICT(id) DO UPDATE SET
       list_id    = excluded.list_id,
       name       = excluded.name,
       quantity   = excluded.quantity,
       note       = excluded.note,
       category   = excluded.category,
       checked    = excluded.checked,
       checked_at = excluded.checked_at,
       -- The user whose op checks the item. Later edits of a checked item keep it, unchecking clears it.
       checked_by = CASE WHEN excluded.checked = 0 THEN NULL
                         WHEN items.checked = 1 THEN items.checked_by
                         ELSE excluded.checked_by END,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       rev        = excluded.rev`,
  );

  return db.transaction(() => {
    const rejected: Rejected[] = [];
    const touched = { lists: new Set<string>(), items: new Set<string>() };
    let changed = false;
    const clamp = (t: number) => Math.min(t, now + MAX_CLOCK_SKEW_MS);

    for (const op of req.ops) {
      const row = { ...op.row, updated_at: clamp(op.row.updated_at) };

      if (op.table === "lists") {
        touched.lists.add(row.id);
        const existing = getListStamp.get({ id: row.id }) as { updated_at: number } | null;
        if (existing && existing.updated_at > row.updated_at) continue;
        upsertList.run({ ...(row as ListInput), rev: nextRev(db) });
        changed = true;
      } else {
        touched.items.add(row.id);
        const item = row as ItemInput;
        if (!listExists.get({ id: item.list_id })) {
          rejected.push({ table: "items", id: item.id, reason: `unknown list ${item.list_id}` });
          continue;
        }
        const existing = getItemStamp.get({ id: item.id }) as { updated_at: number } | null;
        if (existing && existing.updated_at > item.updated_at) continue;
        upsertItem.run({
          ...item,
          checked: item.checked ? 1 : 0,
          checked_by: item.checked ? userId : null,
          added_by: userId,
          rev: nextRev(db),
        });
        changed = true;
      }
    }

    const rev = currentRev(db);
    // A cursor ahead of the server means the DB was reset: send the client everything.
    const since = req.since > rev ? 0 : req.since;

    const lists = db
      .query("SELECT * FROM lists WHERE rev > $since OR id IN (SELECT value FROM json_each($ids)) ORDER BY rev")
      .all({ since, ids: JSON.stringify([...touched.lists]) }) as RawList[];
    const items = db
      .query("SELECT * FROM items WHERE rev > $since OR id IN (SELECT value FROM json_each($ids)) ORDER BY rev")
      .all({ since, ids: JSON.stringify([...touched.items]) }) as RawItem[];

    return {
      response: { rev, changes: { lists: lists.map(toList), items: items.map(toItem) }, rejected },
      changed,
    };
  })();
}
