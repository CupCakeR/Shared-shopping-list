import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import type { Item } from "../../../shared/types";
import { clearChecked, deleteItem, setChecked } from "../actions";
import { items } from "../state";
import { reducedMotion, transition } from "../transition";
import { CheckIcon, XIcon, userName } from "./common";

export const openItemsOf = (listId: string) =>
  items.value.filter((i) => i.list_id === listId && !i.checked && !i.deleted_at).sort((a, b) => a.created_at - b.created_at);

/** A list's open items, then its checked ones under "Erledigt". */
export function ItemSections({ listId, empty }: { listId: string; empty: ComponentChildren }) {
  const open = useComputed(() => openItemsOf(listId));
  const done = useComputed(() =>
    items.value
      .filter((i) => i.list_id === listId && i.checked && !i.deleted_at)
      .sort((a, b) => (b.checked_at ?? 0) - (a.checked_at ?? 0)),
  );

  if (open.value.length === 0 && done.value.length === 0) {
    return <div class="py-12 text-center text-stone-400">{empty}</div>;
  }

  return (
    <>
      {open.value.length > 0 && <Card items={open.value} vtName={`card-${listId}-open`} />}
      {done.value.length > 0 && (
        <section class="mt-8">
          <SectionTitle
            action={
              <button
                onClick={() => clearChecked(listId)}
                class="rounded-lg px-2 py-1 text-sm font-medium text-accent transition hover:bg-accent/10"
              >
                Leeren
              </button>
            }
          >
            Erledigt · {done.value.length}
          </SectionTitle>
          <Card items={done.value} vtName={`card-${listId}-done`} faded />
        </section>
      )}
    </>
  );
}

export function SectionTitle({ children, action }: { children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="mb-2 flex min-h-8 items-center justify-between px-1">
      <h2 class="text-xs font-semibold tracking-wider text-stone-500 uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** vtName: unique on the page, so the card can resize smoothly while an item moves (see toggle). */
export function Card({ items, vtName, faded = false }: { items: Item[]; vtName: string; faded?: boolean }) {
  return (
    <ul
      data-item-vt={vtName}
      class={`divide-y divide-stone-200/70 overflow-hidden rounded-2xl ring-1 ring-stone-200/70 dark:divide-stone-800 dark:ring-stone-800 ${
        faded ? "bg-white/60 dark:bg-stone-900/50" : "bg-white shadow-sm dark:bg-stone-900"
      }`}
    >
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </ul>
  );
}

/** Checking off glides the row into "Erledigt" (and back) while the cards around it resize. */
function toggle(item: Item) {
  const update = () => setChecked(item, !item.checked);
  if (reducedMotion()) return update();
  transition("items", update, (on) => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-item-vt]")) {
      el.style.viewTransitionName = on ? el.dataset.itemVt! : "";
    }
  });
}

function Row({ item }: { item: Item }) {
  const addedBy = userName(item.added_by);
  return (
    <li data-item-vt={`item-${item.id}`} class="flex items-center">
      <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3.5 pl-4 select-none">
        <input type="checkbox" checked={item.checked} onChange={() => toggle(item)} class="peer sr-only" />
        <span class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/20 dark:border-stone-600">
          {item.checked && <CheckIcon class="size-4 stroke-[3.5] text-white" />}
        </span>
        <span class={`truncate text-base transition ${item.checked ? "text-stone-400 line-through dark:text-stone-500" : ""}`}>
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
        <XIcon class="size-4.5 stroke-[2.5]" />
      </button>
    </li>
  );
}
