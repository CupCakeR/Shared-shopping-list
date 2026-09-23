let current: ViewTransition | undefined;
let clearNames: (() => void) | undefined;

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs `update` (awaited, e.g. an IndexedDB write) inside a view transition; style.css picks the
 * animation by `nav` (data-nav on <html>). `name(true)` gives elements their view-transition-name for just this transition (called on the old and
 * the new DOM); `name(false)` takes them away again, so the next transition sees plain page content.
 */
export function transition(nav: string, update: () => unknown, name?: (on: boolean) => void) {
  if (!document.startViewTransition) return void update();
  const root = document.documentElement;
  // A quick second tap skips the running transition; drop its names so they don't leak into this one.
  clearNames?.();
  clearNames = name && (() => name(false));
  name?.(true);
  const t = document.startViewTransition(async () => {
    await update();
    // Preact renders signal changes in a microtask; wait for it before the new snapshot.
    await new Promise((r) => setTimeout(r));
    name?.(true);
  });
  root.dataset.nav = nav;
  current = t;
  t.finished.finally(() => {
    if (current !== t) return;
    delete root.dataset.nav;
    clearNames?.();
    clearNames = undefined;
  });
}
