import type { List } from "../../../shared/types";
import { useState } from "preact/hooks";
import { historyPath, listPath, navigate } from "../router";
import { defaultList, storeLists } from "../state";
import { AddItem } from "./AddItem";
import { Avatar, HistoryIcon, IconButton, PlusIcon, StoreBadge, SyncBadge, TopBar } from "./common";
import { ItemSections, SectionTitle, openItemsOf } from "./Items";
import { StoreDialog } from "./StoreDialog";

/** `/`: the general list, with the store lists as cards above it. */
export function HomeView() {
  const list = defaultList.value;
  const openCount = openItemsOf(list.id).length;

  return (
    <div class="mx-auto flex min-h-dvh max-w-xl flex-col">
      <TopBar>
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-bold tracking-tight">{list.name}</h1>
            <p class="text-sm text-stone-500">{openCount === 0 ? "Alles erledigt" : `Noch ${openCount}`}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <SyncBadge />
            <IconButton label="Verlauf" morphKey={historyPath(list.id)} onClick={() => navigate(historyPath(list.id))}>
              <HistoryIcon />
            </IconButton>
            <Avatar />
          </div>
        </div>
        <AddItem listId={list.id} />
      </TopBar>

      <main class="flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Stores />
        <ItemSections
          listId={list.id}
          empty={
            <>
              <div class="mb-2 text-4xl">🧺</div>
              Die Liste ist leer
            </>
          }
        />
      </main>
    </div>
  );
}

function Stores() {
  const [creating, setCreating] = useState(false);

  return (
    <section class="mb-6">
      <SectionTitle>Läden</SectionTitle>
      <div class="grid grid-cols-2 gap-2.5">
        {storeLists.value.map((list) => (
          <StoreCard key={list.id} list={list} />
        ))}
        <button
          onClick={() => setCreating(true)}
          class="flex min-h-20 items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-300 text-sm font-medium text-stone-500 transition hover:border-accent hover:text-accent active:scale-[0.98] dark:border-stone-700"
        >
          <PlusIcon class="size-4" />
          Neuer Laden
        </button>
      </div>
      {creating && <StoreDialog onClose={() => setCreating(false)} />}
    </section>
  );
}

function StoreCard({ list }: { list: List }) {
  const open = openItemsOf(list.id);
  return (
    <button
      onClick={() => navigate(listPath(list.id))}
      data-morph="page"
      data-morph-key={listPath(list.id)}
      class="flex min-h-20 min-w-0 flex-col rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-stone-200/70 transition active:scale-[0.98] dark:bg-stone-900 dark:ring-stone-800"
    >
      <div class="flex w-full items-center justify-between gap-2">
        <span data-morph="title" data-morph-key={listPath(list.id)} class="flex min-w-0 items-center gap-2">
          <StoreBadge name={list.name} icon={list.icon} size="sm" />
          <span class="truncate font-semibold">{list.name}</span>
        </span>
        {open.length > 0 && (
          <span class="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">{open.length}</span>
        )}
      </div>
      <span class="mt-1 line-clamp-2 text-xs text-stone-500">
        {open.length === 0 ? "Nichts zu holen" : open.map((i) => i.name).join(", ")}
      </span>
    </button>
  );
}
