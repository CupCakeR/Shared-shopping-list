import { useState } from "preact/hooks";
import { back, historyPath, listPath, navigate } from "../router";
import { activeLists, defaultList } from "../state";
import { AddItem } from "./AddItem";
import { BackIcon, HistoryIcon, IconButton, PencilIcon, StoreBadge, SyncBadge, TopBar } from "./common";
import { Card, ItemSections, SectionTitle, openItemsOf } from "./Items";
import { StoreDialog } from "./StoreDialog";

/** `/l/:id`: a store's own list, plus what's still open on the general list (you can get that anywhere). */
export function StoreView({ listId }: { listId: string }) {
  const [editing, setEditing] = useState(false);
  const list = activeLists.value.find((l) => l.id === listId);
  if (!list) return <NotFound />;

  const general = openItemsOf(defaultList.value.id);


  return (
    // Opaque so the page covers home while it grows out of the store card.
    <div data-morph="page" data-morph-key={listPath(list.id)} class="mx-auto flex min-h-dvh max-w-xl flex-col bg-stone-50 dark:bg-stone-950">
      <TopBar>
        <div class="flex items-center gap-1">
          <IconButton label="Zurück" onClick={back}>
            <BackIcon class="size-6" />
          </IconButton>
          <h1 data-morph="title" data-morph-key={listPath(list.id)} class="ml-1 flex min-w-0 flex-1 items-center gap-2.5">
            <StoreBadge name={list.name} icon={list.icon} size="lg" />
            <span class="truncate text-2xl font-bold tracking-tight">{list.name}</span>
          </h1>
          <SyncBadge />
          <IconButton label="Verlauf" morphKey={historyPath(list.id)} onClick={() => navigate(historyPath(list.id))}>
            <HistoryIcon />
          </IconButton>
          <IconButton label="Bearbeiten" onClick={() => setEditing(true)}>
            <PencilIcon class="size-4.5" />
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
            <Card items={general} vtName="card-general" />
          </section>
        )}
      </main>
      {editing && <StoreDialog list={list} onClose={() => setEditing(false)} />}
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
