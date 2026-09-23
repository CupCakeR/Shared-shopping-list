import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { List } from "../../../shared/types";
import { createList, deleteList, updateList } from "../actions";
import { brandChoices, LETTER_ICON } from "../brands";
import { back, listPath, navigate } from "../router";
import { StoreBadge } from "./common";
import { ConfirmDialog, Dialog, primaryButton, secondaryButton } from "./Dialog";

/** Creates a store (no `list`) or edits one: name and icon. Editing also offers deleting it. */
export function StoreDialog({ list, onClose }: { list?: List; onClose: () => void }) {
  const [name, setName] = useState(list?.name ?? "");
  const [icon, setIcon] = useState<string | null>(list?.icon ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    if (list) {
      await updateList(list, { name, icon });
      onClose();
    } else {
      const created = await createList(name, icon);
      onClose();
      if (created) navigate(listPath(created.id));
    }
  }

  async function remove() {
    await deleteList(list!);
    back();
  }

  const choice = (id: string | null, label: string) => (
    <IconChoice key={id ?? "auto"} label={label} selected={icon === id} onClick={() => setIcon(id)}>
      <StoreBadge name={name} icon={id} size="lg" />
    </IconChoice>
  );

  return (
    <Dialog title={list ? "Laden bearbeiten" : "Neuer Laden"} onClose={onClose}>
      <form onSubmit={submit}>
        <div class="flex items-center gap-3">
          <StoreBadge name={name} icon={icon} size="lg" />
          <input
            autoFocus
            placeholder="z. B. Aldi oder dm"
            maxLength={100}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            class="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-stone-800 dark:bg-stone-950"
          />
        </div>

        <h3 class="mt-5 mb-2 px-1 text-xs font-semibold tracking-wider text-stone-500 uppercase">Symbol</h3>
        <div class="-mx-1 grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto p-1">
          {choice(null, "Automatisch")}
          {brandChoices.map((b) => choice(b.id, b.title))}
          {choice(LETTER_ICON, "Buchstabe")}
        </div>

        <div class="mt-5 flex items-center gap-2">
          {list && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              class="mr-auto rounded-xl px-3 py-2.5 font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Löschen
            </button>
          )}
          <button type="button" onClick={onClose} class={`${secondaryButton} ${list ? "" : "ml-auto"}`}>
            Abbrechen
          </button>
          <button disabled={!name.trim()} class={primaryButton}>
            {list ? "Speichern" : "Anlegen"}
          </button>
        </div>
      </form>

      {confirmDelete && (
        <ConfirmDialog title={`„${list!.name}“ löschen?`} confirmLabel="Löschen" danger onConfirm={remove} onClose={() => setConfirmDelete(false)}>
          Der Laden und seine Einträge verschwinden für euch beide.
        </ConfirmDialog>
      )}
    </Dialog>
  );
}

function IconChoice({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      class={`flex min-w-0 flex-col items-center gap-1 rounded-xl p-2 text-[0.7rem] transition ${
        selected ? "bg-accent/10 text-accent ring-2 ring-accent" : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
      }`}
    >
      {children}
      <span class="w-full truncate text-center">{label}</span>
    </button>
  );
}
