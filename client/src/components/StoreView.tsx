import { deleteList, renameList } from "../actions";
import { back, historyPath, navigate } from "../router";
import { activeLists, defaultList } from "../state";
import { AddItem } from "./AddItem";
import { BackIcon, HistoryIcon, IconButton, PencilIcon, SyncBadge, TopBar, TrashIcon } from "./common";
import { Card, ItemSections, SectionTitle, openItemsOf } from "./Items";

/** `/l/:id`: a store's own list, plus what's still open on the general list (you can get that anywhere). */
export function StoreView({ listId }: { listId: string }) {
  const list = activeLists.value.find((l) => l.id === listId);
  if (!list) return <NotFound />;

  const general = openItemsOf(defaultList.value.id);

  function rename() {
    const name = prompt("Laden umbenennen", list!.name);
    if (name !== null) renameList(list!, name);
  }

  async function remove() {
    if (!confirm(`„${list!.name}“ löschen?`)) return;
    await deleteList(list!);
    back();
  }

  return (
    <div class="mx-auto flex min-h-dvh max-w-xl flex-col">
      <TopBar>
        <div class="flex items-center gap-1">
          <IconButton label="Zurück" onClick={back}>
            <BackIcon class="size-6" />
          </IconButton>
          <h1 class="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">{list.name}</h1>
          <SyncBadge />
          <IconButton label="Verlauf" onClick={() => navigate(historyPath(list.id))}>
            <HistoryIcon />
          </IconButton>
          <IconButton label="Umbenennen" onClick={rename}>
            <PencilIcon class="size-4.5" />
          </IconButton>
          <IconButton label="Löschen" onClick={remove}>
            <TrashIcon class="size-4.5" />
          </IconButton>
        </div>
        <AddItem listId={list.id} />
      </TopBar>

      <main class="flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <ItemSections listId={list.id} empty={`Noch nichts speziell für ${list.name}`} />

        {general.length > 0 && (
          <section class="mt-8">
            <SectionTitle>
              {defaultList.value.name} · {general.length}
            </SectionTitle>
            <Card items={general} />
          </section>
        )}
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div class="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center text-stone-500">
      <div class="text-4xl">🤷</div>
      Diese Liste gibt es nicht (mehr).
      <button onClick={() => navigate("/", { replace: true })} class="rounded-xl bg-accent px-4 py-2.5 font-medium text-white">
        Zur Übersicht
      </button>
    </div>
  );
}
