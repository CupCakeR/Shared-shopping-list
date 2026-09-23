import { useComputed } from "@preact/signals";
import type { Item } from "../../../shared/types";
import { addItem } from "../actions";
import { groupHistory } from "../history";
import { back } from "../router";
import { activeLists, items } from "../state";
import { normalize } from "../suggest";
import { BackIcon, CheckIcon, IconButton, PlusIcon, SyncBadge, TopBar, userName } from "./common";

const time = (t: number) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** What was bought on the current list, by day. Each entry can be put back on the list with one tap. */
export function HistoryView({ listId }: { listId: string }) {
  const listName = activeLists.value.find((l) => l.id === listId)?.name;
  const days = useComputed(() => groupHistory(items.value, listId));
  const onList = useComputed(
    () =>
      new Set(
        items.value.filter((i) => i.list_id === listId && !i.checked && !i.deleted_at).map((i) => normalize(i.name)),
      ),
  );

  return (
    <div class="mx-auto flex min-h-dvh max-w-xl flex-col">
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
                {day.items.map((item) => (
                  <Row key={item.id} item={item} onList={onList.value.has(normalize(item.name))} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function Row({ item, onList }: { item: Item; onList: boolean }) {
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
      {onList ? (
        <span class="flex items-center gap-1 px-2 text-xs font-medium text-stone-400">
          <CheckIcon class="size-4" /> Auf der Liste
        </span>
      ) : (
        <button
          aria-label="Wieder hinzufügen"
          title="Wieder hinzufügen"
          onClick={() => addItem(item.list_id, item.name)}
          class="flex size-9 items-center justify-center rounded-full text-accent transition hover:bg-accent/10 active:scale-95"
        >
          <PlusIcon />
        </button>
      )}
    </li>
  );
}
