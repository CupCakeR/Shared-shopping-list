import type { Item, ItemInput } from "../../shared/types";
import { outboxKey } from "./local";
import { session } from "./session";
import { commit, getLocal, items, pendingCount } from "./state";
import { scheduleSync } from "./sync";

/** Always moves forward, even if the clock went backwards or the server clamped a previous timestamp. */
const stamp = (prev?: { updated_at: number }) => Math.max(Date.now(), (prev?.updated_at ?? 0) + 1);

function toInput({ added_by: _, rev: __, ...input }: Item): ItemInput {
  return input;
}

/** Writes rows locally and queues them for sync, in one IndexedDB transaction. */
async function saveItems(rows: Item[]) {
  if (rows.length === 0) return;
  const local = getLocal();
  const tx = local.transaction(["items", "outbox"], "readwrite");
  for (const row of rows) {
    const op = { table: "items", row: toInput(row) } as const;
    await tx.objectStore("items").put(row);
    await tx.objectStore("outbox").put({ key: outboxKey(op), op, v: crypto.randomUUID() });
  }
  await tx.done;

  commit({ items: rows });
  pendingCount.value = await local.count("outbox");
  scheduleSync();
}

export function addItem(listId: string, name: string) {
  const trimmed = name.trim();
  const user = session.value?.user;
  if (!trimmed || !user) return;
  const now = Date.now();
  return saveItems([
    {
      id: crypto.randomUUID(),
      list_id: listId,
      name: trimmed,
      quantity: null,
      note: null,
      category: null,
      checked: false,
      checked_at: null,
      added_by: user.id, // optimistic, the server sets the real value
      created_at: now,
      updated_at: now,
      deleted_at: null,
      rev: 0,
    },
  ]);
}

export function setChecked(item: Item, checked: boolean) {
  const updated_at = stamp(item);
  return saveItems([{ ...item, checked, checked_at: checked ? updated_at : null, updated_at }]);
}

export function deleteItem(item: Item) {
  const updated_at = stamp(item);
  return saveItems([{ ...item, deleted_at: updated_at, updated_at }]);
}

export function clearChecked(listId: string) {
  const done = items.value.filter((i) => i.list_id === listId && i.checked && !i.deleted_at);
  return saveItems(
    done.map((i) => {
      const updated_at = stamp(i);
      return { ...i, deleted_at: updated_at, updated_at };
    }),
  );
}
