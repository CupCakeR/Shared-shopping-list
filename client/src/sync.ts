import type { Item, List, Op } from "../../shared/types";
import { AuthError, postSync } from "./api";
import { logout, session } from "./session";
import { commit, getLocal, pendingCount, syncStatus } from "./state";

const DEBOUNCE_MS = 500;
const RETRY_MS = 15_000;

let running = false;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;

/** Coalesces bursts of local edits into one request. */
export function scheduleSync(delay = DEBOUNCE_MS) {
  clearTimeout(debounce);
  debounce = setTimeout(runSync, delay);
}

export async function runSync() {
  if (running) {
    again = true;
    return;
  }
  const s = session.value;
  if (!s) return;

  running = true;
  clearTimeout(retry);
  syncStatus.value = "syncing";
  try {
    do {
      again = false;
      await syncOnce(s.key);
    } while (again);
    syncStatus.value = "idle";
  } catch (err) {
    if (err instanceof AuthError) {
      logout();
      syncStatus.value = "idle";
    } else {
      syncStatus.value = navigator.onLine ? "error" : "offline";
      retry = setTimeout(runSync, RETRY_MS);
    }
  } finally {
    running = false;
  }
}

async function syncOnce(key: string) {
  const local = getLocal();
  const sent = await local.getAll("outbox");
  const since = (await local.get("meta", "cursor")) ?? 0;
  // Lists before items, so items on a list created offline don't arrive before their list.
  const rank = (op: Op) => (op.table === "lists" ? 0 : 1);
  const ops = sent.map((e) => e.op).sort((a, b) => rank(a) - rank(b));

  const res = await postSync(key, { since, ops });

  // No awaits on anything but this transaction below, or IndexedDB auto-commits it early.
  const tx = local.transaction(["lists", "items", "outbox", "meta"], "readwrite");
  const outbox = tx.objectStore("outbox");

  for (const entry of sent) {
    const current = await outbox.get(entry.key);
    if (current?.v === entry.v) await outbox.delete(entry.key);
  }
  // Rows edited locally while the request was in flight: the local version wins until it has been sent.
  const pending = new Set(await outbox.getAllKeys());

  const appliedLists: List[] = [];
  for (const l of res.changes.lists) {
    if (pending.has(`lists:${l.id}`)) continue;
    await tx.objectStore("lists").put(l);
    appliedLists.push(l);
  }
  const appliedItems: Item[] = [];
  for (const i of res.changes.items) {
    if (pending.has(`items:${i.id}`)) continue;
    await tx.objectStore("items").put(i);
    appliedItems.push(i);
  }
  // Rejected rows never made it to the server, so drop them locally too.
  const removedLists: string[] = [];
  const removedItems: string[] = [];
  for (const r of res.rejected) {
    if (pending.has(`${r.table}:${r.id}`)) continue;
    console.warn("sync rejected", r);
    await tx.objectStore(r.table).delete(r.id);
    (r.table === "lists" ? removedLists : removedItems).push(r.id);
  }

  await tx.objectStore("meta").put(res.rev, "cursor");
  await tx.done;

  commit({ lists: appliedLists, items: appliedItems, removedLists, removedItems });
  pendingCount.value = pending.size;
}
