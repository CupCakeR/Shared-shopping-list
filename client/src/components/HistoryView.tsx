import { useComputed, useSignal } from "@preact/signals";
import type { Item } from "../../../shared/types";
import { addItem, deleteItem } from "../actions";
import { groupHistory } from "../history";
import { back, historyPath } from "../router";
import { activeLists, items } from "../state";
import { normalize } from "../suggest";
import { BackIcon, CheckIcon, IconButton, PlusIcon, SyncBadge, TopBar, UndoIcon, userName } from "./common";

const time = (t: number) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * What was bought on the current list, by day. Each entry can be put back on the list with one tap,
 * and taken off again while this view is open.
 */
export function HistoryView({ listId }: { listId: string }) {
  const listName = activeLists.value.find((l) => l.id === listId)?.name;
  const days = useComputed(() => groupHistory(items.value, listId));
  const onList = useComputed(
    () =>
      new Set(
        items.value.filter((i) => i.list_id === listId && !i.checked && !i.deleted_at).map((i) => normalize(i.name)),
      ),
  );
  /** Normalized name -> id of the item re-added from here, so it can be undone. */
  const added = useSignal(new Map<string, string>());

  async function readd(item: Item) {
    const created = await addItem(item.list_id, item.name);
    if (created) added.value = new Map(added.value).set(normalize(item.name), created.id);
  }

  /** The re-added item for a name, as long as it is still open on the list. */
  const undoable = (key: string) => {
    const id = added.value.get(key);
    return id ? items.value.find((i) => i.id === id && !i.checked && !i.deleted_at) : undefined;
  };

  function undo(created: Item) {
    deleteItem(created);
    const next = new Map(added.value);
    next.delete(normalize(created.name));
    added.value = next;
  }

  return (
    <div
      data-morph="page"
      data-morph-key={historyPath(listId)}
      class="mx-auto flex min-h-dvh max-w-xl flex-col bg-stone-50 dark:bg-stone-950"
    >
      <TopBar>
        <div class="flex items-center gap-2">
          <IconButton label="Zurück" onClick={back}>
            <BackIcon class="size-6" />
          </IconButton>
          <div class="min-w-0 flex-1">
            <h1 class="text-2xl font-bold tracking-tight">Verlauf</h1>
            <p class="truncate text-sm text-stone-500">{listName}</p>
          </div>
          <SyncBadge />
        </div>
      </TopBar>

      <main class="flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {days.value.length === 0 ? (
          <div class="py-20 text-center text-stone-400">
            <div class="mb-2 text-4xl">🧾</div>
            Noch nichts gekauft
          </div>
        ) : (
          days.value.map((day) => (
            <section key={day.label} class="mt-4 first:mt-1">
              <h2 class="mb-2 px-1 text-xs font-semibold tracking-wider text-stone-500 uppercase">{day.label}</h2>
              <ul class="divide-y divide-stone-200/70 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {day.items.map((item) => {
                  const key = normalize(item.name);
                  const created = undoable(key);
                  return (
                    <Row
                      key={item.id}
                      item={item}
                      onList={onList.value.has(key)}
                      onAdd={() => readd(item)}
                      onUndo={created && (() => undo(created))}
                    />
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

/** onUndo: set while the item is on the list because it was re-added from this view. */
function Row({
  item,
  onList,
  onAdd,
  onUndo,
}: {
  item: Item;
  onList: boolean;
  onAdd: () => void;
  onUndo?: () => void;
}) {
  const by = userName(item.checked_by);
  return (
    <li class="flex items-center gap-3 py-2.5 pr-2 pl-4">
      <div class="min-w-0 flex-1">
        <div class="truncate">{item.name}</div>
        <div class="text-xs text-stone-500">
          {by ? `${by} · ` : ""}
          {time(item.checked_at!)}
        </div>
      </div>
      {onUndo ? (
        <button
          aria-label="Rückgängig"
          title="Rückgängig"
          onClick={onUndo}
          class="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-accent transition hover:bg-accent/10 active:scale-95"
        >
          <UndoIcon class="size-4" /> Rückgängig
        </button>
      ) : onList ? (
        <span class="flex items-center gap-1 px-2 text-xs font-medium text-stone-400">
          <CheckIcon class="size-4" /> Auf der Liste
        </span>
      ) : (
        <button
          aria-label="Wieder hinzufügen"
          title="Wieder hinzufügen"
          onClick={onAdd}
          class="flex size-9 items-center justify-center rounded-full text-accent transition hover:bg-accent/10 active:scale-95"
        >
          <PlusIcon />
        </button>
      )}
    </li>
  );
}
