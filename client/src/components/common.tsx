import type { ComponentChildren } from "preact";
import { brandOf } from "../brands";
import { ConfirmDialog } from "./Dialog";
import { useEffect, useState } from "preact/hooks";
import { logout, session } from "../session";
import { pendingCount, syncStatus } from "../state";

export function userName(id: string | null): string | undefined {
  return session.value?.users.find((u) => u.id === id)?.name;
}

/** Sticky, blurred top bar shared by all views. data-item-vt keeps it above rows moving underneath (style.css). */
export function TopBar({ children }: { children: ComponentChildren }) {
  return (
    <header data-item-vt="topbar" class="sticky top-0 z-20 bg-stone-50/85 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur-lg dark:bg-stone-950/85">
      {children}
    </header>
  );
}

/** The store's logo (Simple Icons) or first letter, in its brand color. `icon`: the store's pick, see brandOf. */
export function StoreBadge({ name, icon, size }: { name: string; icon: string | null; size: "sm" | "lg" }) {
  const brand = brandOf(name, icon);
  return (
    <span
      aria-hidden="true"
      style={{ background: brand.background, color: brand.foreground }}
      class={`flex shrink-0 items-center justify-center ${size === "sm" ? "size-6 rounded-md text-xs" : "size-8 rounded-lg text-base"}`}
    >
      {brand.path ? (
        <svg viewBox="0 0 24 24" fill="currentColor" class="size-[62%]">
          <path d={brand.path} />
        </svg>
      ) : (
        <span class="font-bold">{brand.letter}</span>
      )}
    </span>
  );
}

/** morphKey: the path of the page this button grows into on navigation (see router.ts). */
export function IconButton({
  label,
  onClick,
  morphKey,
  children,
}: {
  label: string;
  onClick: () => void;
  morphKey?: string;
  children: ComponentChildren;
}) {
  return (
    <button
      data-morph={morphKey && "page"}
      data-morph-key={morphKey}
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
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        title={`Angemeldet als ${name}. Tippen zum Abmelden.`}
        class="flex size-9 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700 transition active:scale-95 dark:bg-stone-800 dark:text-stone-200"
      >
        {name[0]}
      </button>
      {confirming && (
        <ConfirmDialog title="Abmelden?" confirmLabel="Abmelden" onConfirm={logout} onClose={() => setConfirming(false)}>
          Du bist als {name} angemeldet. Danach brauchst du deinen Schlüssel wieder.
        </ConfirmDialog>
      )}
    </>
  );
}

/** Fades in while syncing, offline or failed, and out once everything is synced. */
export function SyncBadge() {
  const status = syncStatus.value;
  const pending = pendingCount.value;
  const visible = status !== "idle" || pending > 0;
  // Stays mounted after `visible` turns false, until the fade-out is done.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) return setMounted(true);
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!visible && !mounted) return null;

  const failed = status === "offline" || status === "error";
  const label = status === "offline" ? "Offline" : status === "error" ? "Sync fehlgeschlagen" : "Synchronisiere";
  return (
    <span
      class={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none ${
        visible ? "opacity-100" : "opacity-0"
      } ${
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
export const UndoIcon = (p: { class?: string }) => <Svg {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>;
export const HistoryIcon = (p: { class?: string }) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Svg>
);
