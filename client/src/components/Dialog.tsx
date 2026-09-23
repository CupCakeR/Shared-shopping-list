import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export const primaryButton =
  "rounded-xl bg-accent px-4 py-2.5 font-medium text-white transition hover:bg-accent-strong active:scale-[0.98] disabled:opacity-40";
export const secondaryButton =
  "rounded-xl px-4 py-2.5 font-medium text-stone-600 transition hover:bg-stone-100 active:scale-[0.98] dark:text-stone-300 dark:hover:bg-stone-800";
export const dangerButton =
  "rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white transition hover:bg-red-700 active:scale-[0.98]";

/**
 * App-styled modal; mount it to open it. A native <dialog> underneath, for the focus trap,
 * Escape and the top layer. Closing (Escape, backdrop, buttons) calls onClose; the parent unmounts it.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the <dialog> itself, not on its content, is a click on the backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
      class="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm dark:bg-stone-900 dark:text-stone-100"
    >
      <div class="p-5">
        <h2 class="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ComponentChildren;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      {children && <p class="-mt-2 mb-5 text-sm text-stone-500">{children}</p>}
      <div class="flex justify-end gap-2">
        <button onClick={onClose} class={secondaryButton}>
          Abbrechen
        </button>
        <button
          onClick={() => {
            onClose();
            onConfirm();
          }}
          class={danger ? dangerButton : primaryButton}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
