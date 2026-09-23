import { useComputed } from "@preact/signals";
import { useState } from "preact/hooks";
import { DEFAULT_LIST_ID, type Item } from "../../../shared/types";
import { addItem, clearChecked, deleteItem, setChecked } from "../actions";
import { logout, session } from "../session";
import { items, lists, pendingCount, syncStatus } from "../state";

export function ListView() {
  const listId = DEFAULT_LIST_ID; // list switching comes with milestone 5
  const list = useComputed(() => lists.value.find((l) => l.id === listId));
  const visible = useComputed(() => items.value.filter((i) => i.list_id === listId && !i.deleted_at));
  const open = useComputed(() => visible.value.filter((i) => !i.checked).sort((a, b) => a.created_at - b.created_at));
  const done = useComputed(() =>
    visible.value.filter((i) => i.checked).sort((a, b) => (b.checked_at ?? 0) - (a.checked_at ?? 0)),
  );
  const [name, setName] = useState("");

  function submit(e: Event) {
    e.preventDefault();
    addItem(listId, name);
    setName("");
  }

  return (
    <div class="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header class="sticky top-0 z-10 bg-stone-50/85 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur-lg dark:bg-stone-950/85">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold tracking-tight">{list.value?.name}</h1>
            <p class="text-sm text-stone-500">
              {open.value.length === 0 ? "Alles erledigt" : `Noch ${open.value.length}`}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <SyncBadge />
            <button
              onClick={() => confirm("Abmelden?") && logout()}
              title={`Angemeldet als ${session.value?.user.name}. Tippen zum Abmelden.`}
              class="flex size-9 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700 transition active:scale-95 dark:bg-stone-800 dark:text-stone-200"
            >
              {session.value?.user.name[0]}
            </button>
          </div>
        </div>

        <form onSubmit={submit} class="mt-4 flex gap-2">
          <input
            placeholder="Artikel hinzufügen…"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            enterkeyhint="done"
            class="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition placeholder:text-stone-400 focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-stone-800 dark:bg-stone-900"
          />
          <button
            disabled={!name.trim()}
            aria-label="Hinzufügen"
            class="flex size-12.5 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm transition hover:bg-accent-strong active:scale-95 disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </form>
      </header>

      <main class="flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {visible.value.length === 0 ? (
          <div class="py-20 text-center text-stone-400">
            <div class="mb-2 text-4xl">🧺</div>
            Die Liste ist leer
          </div>
        ) : (
          <>
            {open.value.length > 0 && (
              <ul class="divide-y divide-stone-200/70 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {open.value.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </ul>
            )}

            {done.value.length > 0 && (
              <section class="mt-8">
                <div class="mb-2 flex items-center justify-between px-1">
                  <h2 class="text-xs font-semibold tracking-wider text-stone-500 uppercase">
                    Erledigt · {done.value.length}
                  </h2>
                  <button
                    onClick={() => clearChecked(listId)}
                    class="rounded-lg px-2 py-1 text-sm font-medium text-accent transition hover:bg-accent/10"
                  >
                    Leeren
                  </button>
                </div>
                <ul class="divide-y divide-stone-200/70 overflow-hidden rounded-2xl bg-white/60 ring-1 ring-stone-200/70 dark:divide-stone-800 dark:bg-stone-900/50 dark:ring-stone-800">
                  {done.value.map((item) => (
                    <Row key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Row({ item }: { item: Item }) {
  const addedBy = session.value?.users.find((u) => u.id === item.added_by)?.name;
  return (
    <li class="group flex items-center">
      <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3.5 pl-4 select-none">
        <input
          type="checkbox"
          checked={item.checked}
          onChange={() => setChecked(item, !item.checked)}
          class="peer sr-only"
        />
        <span class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/20 dark:border-stone-600">
          {item.checked && (
            <svg viewBox="0 0 24 24" class="size-4 text-white" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
        <span
          class={`truncate text-base transition ${item.checked ? "text-stone-400 line-through dark:text-stone-500" : ""}`}
        >
          {item.name}
        </span>
        {addedBy && (
          <span
            title={`Hinzugefügt von ${addedBy}`}
            class="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[0.65rem] font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-400"
          >
            {addedBy[0]}
          </span>
        )}
      </label>
      <button
        aria-label="Löschen"
        onClick={() => deleteItem(item)}
        class="flex size-11 shrink-0 items-center justify-center text-stone-300 transition hover:text-red-500 dark:text-stone-600"
      >
        <svg viewBox="0 0 24 24" class="size-4.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </li>
  );
}

function SyncBadge() {
  const status = syncStatus.value;
  const pending = pendingCount.value;
  if (status === "idle" && pending === 0) return null;

  const failed = status === "offline" || status === "error";
  const label = status === "offline" ? "Offline" : status === "error" ? "Sync fehlgeschlagen" : "Synchronisiere";
  return (
    <span
      class={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        failed
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
      }`}
    >
      <span class={`size-1.5 rounded-full ${failed ? "bg-amber-500" : "animate-pulse bg-stone-500"}`} />
      {label}
      {pending > 0 && ` · ${pending}`}
    </span>
  );
}
