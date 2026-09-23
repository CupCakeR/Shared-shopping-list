import type { ComponentChildren } from "preact";
import { logout, session } from "../session";
import { pendingCount, syncStatus } from "../state";

export function userName(id: string | null): string | undefined {
  return session.value?.users.find((u) => u.id === id)?.name;
}

/** Sticky, blurred top bar shared by all views. */
export function TopBar({ children }: { children: ComponentChildren }) {
  return (
    <header class="sticky top-0 z-20 bg-stone-50/85 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur-lg dark:bg-stone-950/85">
      {children}
    </header>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ComponentChildren }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      class="flex size-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-200 active:scale-95 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      {children}
    </button>
  );
}

export function Avatar() {
  const name = session.value?.user.name ?? "";
  return (
    <button
      onClick={() => confirm("Abmelden?") && logout()}
      title={`Angemeldet als ${name}. Tippen zum Abmelden.`}
      class="flex size-9 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700 transition active:scale-95 dark:bg-stone-800 dark:text-stone-200"
    >
      {name[0]}
    </button>
  );
}

export function SyncBadge() {
  const status = syncStatus.value;
  const pending = pendingCount.value;
  if (status === "idle" && pending === 0) return null;

  const failed = status === "offline" || status === "error";
  const label = status === "offline" ? "Offline" : status === "error" ? "Sync fehlgeschlagen" : "Synchronisiere";
  return (
    <span
      class={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
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

// --- icons (24px grid, stroke) ---------------------------------------------------

const Svg = ({ children, class: cls = "size-5" }: { children: ComponentChildren; class?: string }) => (
  <svg viewBox="0 0 24 24" class={cls} fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    {children}
  </svg>
);

export const PlusIcon = (p: { class?: string }) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const XIcon = (p: { class?: string }) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const CheckIcon = (p: { class?: string }) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const ChevronDownIcon = (p: { class?: string }) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const BackIcon = (p: { class?: string }) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const PencilIcon = (p: { class?: string }) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></Svg>;
export const TrashIcon = (p: { class?: string }) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const HistoryIcon = (p: { class?: string }) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Svg>
);
