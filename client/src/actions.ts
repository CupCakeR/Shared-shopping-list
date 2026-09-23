import type { Item, ItemInput, List, ListInput, Op } from "../../shared/types";
import { outboxKey } from "./local";
import { session } from "./session";
import { commit, getLocal, items, pendingCount } from "./state";
import { normalize } from "./suggest";
import { scheduleSync } from "./sync";

/** Always moves forward, even if the clock went backwards or the server clamped a previous timestamp. */
const stamp = (prev?: { updated_at: number }) => Math.max(Date.now(), (prev?.updated_at ?? 0) + 1);

function itemOp({ added_by: _, checked_by: __, rev: ___, ...row }: Item): Op {
  return { table: "items", row: row satisfies ItemInput };
}

function listOp({ id, name, icon, created_at, updated_at, deleted_at }: List): Op {
  // Lists stored before icons existed have no icon field locally.
  return { table: "lists", row: { id, name, icon: icon ?? null, created_at, updated_at, deleted_at } satisfies ListInput };
}

/** Writes rows locally and queues them for sync, in one IndexedDB transaction. */
async function save(changes: { lists?: List[]; items?: Item[] }) {
  const ops = [...(changes.lists ?? []).map(listOp), ...(changes.items ?? []).map(itemOp)];
  if (ops.length === 0) return;
  const local = getLocal();
  const tx = local.transaction(["lists", "items", "outbox"], "readwrite");
  for (const l of changes.lists ?? []) await tx.objectStore("lists").put(l);
  for (const i of changes.items ?? []) await tx.objectStore("items").put(i);
  for (const op of ops) await tx.objectStore("outbox").put({ key: outboxKey(op), op, v: crypto.randomUUID() });
  await tx.done;

  commit(changes);
  pendingCount.value = await local.count("outbox");
  scheduleSync();
}

// --- items --------------------------------------------------------------------

/** Adds an item, unless one with the same name is already open on the list. */
export function addItem(listId: string, name: string) {
  const trimmed = name.trim();
  const user = session.value?.user;
  if (!trimmed || !user) return;
  const key = normalize(trimmed);
  const duplicate = items.value.some((i) => i.list_id === listId && !i.checked && !i.deleted_at && normalize(i.name) === key);
  if (duplicate) return;

  const now = Date.now();
  return save({
    items: [
      {
        id: crypto.randomUUID(),
        list_id: listId,
        name: trimmed,
        quantity: null,
        note: null,
        category: null,
        checked: false,
        checked_at: null,
        checked_by: null,
        added_by: user.id, // optimistic, the server sets the real value
        created_at: now,
        updated_at: now,
        deleted_at: null,
        rev: 0,
      },
    ],
  });
}

export function setChecked(item: Item, checked: boolean) {
  const updated_at = stamp(item);
  return save({
    items: [
      {
        ...item,
        checked,
        checked_at: checked ? updated_at : null,
        checked_by: checked ? (session.value?.user.id ?? null) : null, // optimistic, like added_by
        updated_at,
      },
    ],
  });
}

export function deleteItem(item: Item) {
  const updated_at = stamp(item);
  return save({ items: [{ ...item, deleted_at: updated_at, updated_at }] });
}

export function clearChecked(listId: string) {
  const done = items.value.filter((i) => i.list_id === listId && i.checked && !i.deleted_at);
  return save({
    items: done.map((i) => {
      const updated_at = stamp(i);
      return { ...i, deleted_at: updated_at, updated_at };
    }),
  });
}

// --- lists --------------------------------------------------------------------

export async function createList(name: string, icon: string | null): Promise<List | undefined> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = Date.now();
  const list: List = {
    id: crypto.randomUUID(),
    name: trimmed,
    icon,
    is_default: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    rev: 0,
  };
  await save({ lists: [list] });
  return list;
}

export function updateList(list: List, { name, icon }: { name: string; icon: string | null }) {
  const trimmed = name.trim();
  if (!trimmed || (trimmed === list.name && icon === (list.icon ?? null))) return;
  return save({ lists: [{ ...list, name: trimmed, icon, updated_at: stamp(list) }] });
}

/** Soft-deletes the list. Its items stay in the database, so their names keep feeding suggestions. */
export function deleteList(list: List) {
  if (list.is_default) return;
  const updated_at = stamp(list);
  return save({ lists: [{ ...list, deleted_at: updated_at, updated_at }] });
}
