import { useComputed } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import { addItem } from "../actions";
import { items } from "../state";
import { rankHistory, suggest } from "../suggest";
import { PlusIcon } from "./common";

/** Input for new items. While focused it shows suggestions from history as tappable chips. */
export function AddItem({ listId }: { listId: string }) {
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ranked = useComputed(() => rankHistory(items.value, listId));
  const suggestions = suggest(ranked.value, name, name.trim() ? 6 : 10);

  function add(value: string) {
    addItem(listId, value);
    setName("");
    input.current?.focus();
  }

  function submit(e: Event) {
    e.preventDefault();
    add(name);
  }

  return (
    <div class="mt-4">
      <form onSubmit={submit} class="flex gap-2">
        <input
          ref={input}
          placeholder="Artikel hinzufügen…"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          enterkeyhint="done"
          autocomplete="off"
          class="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition placeholder:text-stone-400 focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-stone-800 dark:bg-stone-900"
        />
        <button
          disabled={!name.trim()}
          aria-label="Hinzufügen"
          class="flex size-12.5 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm transition hover:bg-accent-strong active:scale-95 disabled:opacity-40"
        >
          <PlusIcon class="size-6" />
        </button>
      </form>

      {(focused || name.trim()) && suggestions.length > 0 && (
        <div class="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              // Keep the input focused (and the keyboard open) while tapping chips.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => add(s.name)}
              class="flex shrink-0 items-center gap-1 rounded-full bg-white py-1.5 pr-3.5 pl-2.5 text-sm font-medium whitespace-nowrap shadow-sm ring-1 ring-stone-200 transition active:scale-95 dark:bg-stone-900 dark:ring-stone-800"
            >
              <PlusIcon class="size-3.5 text-accent" />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
