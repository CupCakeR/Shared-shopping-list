import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Item } from "../../../shared/types";
import { clearChecked, deleteItem, isDuplicateName, renameItem, setChecked } from "../actions";
import { items } from "../state";
import { reducedMotion, transition } from "../transition";
import { CheckIcon, userName } from "./common";
import { Dialog, primaryButton, secondaryButton } from "./Dialog";

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

const LONG_PRESS_MS = 500;
/** How far a pointer may move before a press counts as a drag (swipe or scroll). */
const SLOP_PX = 10;
/** Share of the row width a swipe must pass to delete. */
const SWIPE_DELETE_RATIO = 0.4;

/**
 * Row gestures: hold still to long press, drag left to swipe. Vertical drags stay with the browser
 * (touch-action: pan-y), which cancels the pointer once it scrolls. Swallows the click after either gesture.
 */
function useRowGestures({ onLongPress, onSwipe }: { onLongPress?: () => void; onSwipe: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef({ x: 0, y: 0, width: 0, swiping: false, armed: false, suppressClick: false, timer: 0 });

  const cancelLongPress = () => clearTimeout(g.current.timer);
  const reset = () => {
    cancelLongPress();
    g.current.swiping = false;
    setDragging(false);
    setOffset(0);
  };

  return {
    offset,
    dragging,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        const s = g.current;
        Object.assign(s, { x: e.clientX, y: e.clientY, width: (e.currentTarget as HTMLElement).offsetWidth });
        Object.assign(s, { swiping: false, armed: false, suppressClick: false });
        cancelLongPress();
        if (onLongPress) {
          s.timer = window.setTimeout(() => {
            s.suppressClick = true;
            navigator.vibrate?.(10);
            onLongPress();
          }, LONG_PRESS_MS);
        }
      },
      onPointerMove: (e: PointerEvent) => {
        const s = g.current;
        if (!(e.buttons & 1)) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.swiping) {
          if (Math.hypot(dx, dy) <= SLOP_PX) return;
          cancelLongPress();
          if (s.suppressClick || dx >= 0 || Math.abs(dx) < Math.abs(dy)) return;
          s.swiping = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
        }
        const next = Math.min(0, dx);
        const armed = -next > s.width * SWIPE_DELETE_RATIO;
        if (armed !== s.armed) {
          s.armed = armed;
          if (armed) navigator.vibrate?.(10);
        }
        setOffset(next);
      },
      onPointerUp: () => {
        const s = g.current;
        cancelLongPress();
        if (!s.swiping) return;
        s.swiping = false;
        s.suppressClick = true;
        setDragging(false);
        if (s.armed) {
          setOffset(-s.width); // slides out, then the row is removed
          setTimeout(onSwipe, reducedMotion() ? 0 : 150);
        } else {
          setOffset(0);
        }
      },
      onPointerCancel: reset,
      onContextMenu: (e: Event) => {
        if (!onLongPress) return;
        e.preventDefault();
        cancelLongPress();
        // A touch long press already fired from the timer. Right-click and the menu key have no click to swallow.
        if (!g.current.suppressClick) onLongPress();
      },
      onClickCapture: (e: Event) => {
        if (!g.current.suppressClick) return;
        g.current.suppressClick = false;
        e.preventDefault(); // keeps the label from toggling the checkbox
        e.stopPropagation();
      },
    },
  };
}

/** Tap checks the item off, long press renames it (open items only), swipe left or Delete removes it. */
function Row({ item }: { item: Item }) {
  const addedBy = userName(item.added_by);
  const [renaming, setRenaming] = useState(false);
  const { offset, dragging, handlers } = useRowGestures({
    onLongPress: item.checked ? undefined : () => setRenaming(true),
    onSwipe: () => deleteItem(item),
  });

  return (
    <li
      data-item-vt={`item-${item.id}`}
      // Only from the item's own checkbox: the rename dialog's input is inside this <li> too.
      onKeyDown={(e) => (e.key === "Delete" || e.key === "Backspace") && (e.target as HTMLInputElement).type === "checkbox" && deleteItem(item)}
      class="relative overflow-hidden"
    >
      {offset !== 0 && (
        <div aria-hidden="true" class="absolute inset-0 flex items-center justify-end bg-red-600 pr-5 text-sm font-medium text-white">
          Löschen
        </div>
      )}
      <label
        {...handlers}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        class={`relative flex cursor-pointer touch-pan-y items-center gap-3 py-3.5 pr-4 pl-4 select-none [-webkit-touch-callout:none] ${
          dragging ? "" : "transition-transform duration-150 motion-reduce:transition-none"
        } ${offset !== 0 ? "bg-white dark:bg-stone-900" : ""}`}
      >
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
      {renaming && <RenameDialog item={item} onClose={() => setRenaming(false)} />}
    </li>
  );
}

function RenameDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const duplicate = isDuplicateName(item, name);

  async function submit(e: Event) {
    e.preventDefault();
    if (!name.trim() || duplicate) return;
    await renameItem(item, name);
    onClose();
  }

  return (
    <Dialog title="Artikel umbenennen" onClose={onClose}>
      <form onSubmit={submit}>
        <input
          autoFocus
          maxLength={200}
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
          enterkeyhint="done"
          autocomplete="off"
          class="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-stone-800 dark:bg-stone-950"
        />
        {duplicate && <p class="mt-2 px-1 text-sm text-red-600 dark:text-red-400">Steht schon auf der Liste.</p>}
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} class={secondaryButton}>
            Abbrechen
          </button>
          <button disabled={!name.trim() || duplicate} class={primaryButton}>
            Speichern
          </button>
        </div>
      </form>
    </Dialog>
  );
}
