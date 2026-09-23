import { computed, signal } from "@preact/signals";
import { DEFAULT_LIST_ID, type Item, type List } from "../../shared/types";
import { type LocalDb, openLocal } from "./local";

/** In-memory mirror of IndexedDB. Tombstoned rows are kept (autocomplete will need them); the UI filters them. */
export const lists = signal<List[]>([]);
export const items = signal<Item[]>([]);
export const pendingCount = signal(0);
export const syncStatus = signal<"idle" | "syncing" | "offline" | "error">("idle");

/** Default list first, then the rest in creation order. */
export const activeLists = computed(() =>
  lists.value
    .filter((l) => !l.deleted_at)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.created_at - b.created_at),
);

/** The general list everything goes on. Always present (placeholder until the first sync). */
export const defaultList = computed(() => lists.value.find((l) => l.id === DEFAULT_LIST_ID)!);

/** Store-specific lists. */
export const storeLists = computed(() => activeLists.value.filter((l) => !l.is_default));

const listMap = new Map<string, List>();
const itemMap = new Map<string, Item>();

// Shown until the first sync delivers the real default list, so a fresh install works offline.
const PLACEHOLDER_DEFAULT: List = {
  id: DEFAULT_LIST_ID,
  name: "Einkaufsliste",
  is_default: true,
  created_at: 0,
  updated_at: 0,
  deleted_at: null,
  rev: 0,
};

let local: LocalDb | undefined;

export function getLocal(): LocalDb {
  if (!local) throw new Error("initLocal() has not run");
  return local;
}

export async function initLocal() {
  local = await openLocal();
  for (const l of await local.getAll("lists")) listMap.set(l.id, l);
  for (const i of await local.getAll("items")) itemMap.set(i.id, i);
  pendingCount.value = await local.count("outbox");
  publish();
}

function publish() {
  const all = [...listMap.values()];
  lists.value = listMap.has(DEFAULT_LIST_ID) ? all : [PLACEHOLDER_DEFAULT, ...all];
  items.value = [...itemMap.values()];
}

/** Updates the in-memory state after the rows were written to IndexedDB. */
export function commit(changes: { lists?: List[]; items?: Item[]; removedItems?: string[]; removedLists?: string[] }) {
  for (const l of changes.lists ?? []) listMap.set(l.id, l);
  for (const i of changes.items ?? []) itemMap.set(i.id, i);
  for (const id of changes.removedLists ?? []) listMap.delete(id);
  for (const id of changes.removedItems ?? []) itemMap.delete(id);
  publish();
}
