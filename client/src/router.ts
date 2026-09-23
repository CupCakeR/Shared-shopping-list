import { computed, signal } from "@preact/signals";
import { parseRoute, type Route } from "./routes";
import { reducedMotion, transition } from "./transition";

export * from "./routes";

const path = signal(location.pathname);
export const route = computed(() => parseRoute(path.value));

window.addEventListener("popstate", (e) => {
  // Swipe-back on phones already animates the page, so don't stack ours on top.
  if (e.hasUAVisualTransition) path.value = location.pathname;
  else transitionTo(location.pathname);
});

export function navigate(to: string, { replace = false } = {}) {
  if (to !== location.pathname) {
    // inApp marks entries we pushed, so back() knows whether history.back() stays inside the app.
    if (replace) history.replaceState(history.state, "", to);
    else history.pushState({ inApp: true }, "", to);
  }
  transitionTo(to, () => window.scrollTo(0, 0));
}

/** Like the browser's back, but lands on the home screen when the app was opened on a deep link. */
export function back() {
  if (history.state?.inApp) history.back();
  else navigate("/", { replace: true });
}

const depth: Record<Route["name"], number> = { home: 0, list: 1, history: 2 };

/** Swaps the page inside a view transition: a morph (see nameMorphs) or a left/right push, see style.css. */
function transitionTo(to: string, afterRender?: () => void) {
  const from = depth[route.value.name];
  const next = depth[parseRoute(to).name];
  const update = () => {
    path.value = to;
    afterRender?.();
  };
  if (from === next) return update();
  // Going one level deeper morphs the tapped element (data-morph-key = the deeper path) into that page, and back.
  const deeper = next > from ? to : path.value;
  const morph = !reducedMotion() && document.querySelector(`[data-morph-key="${CSS.escape(deeper)}"]`);
  if (morph) transition("morph", update, (on) => nameMorphs(on ? deeper : undefined));
  else transition(next > from ? "forward" : "back", update);
}

/** Names only the parts (data-morph) for this key, so the other cards crossfade with the page instead of on top. */
function nameMorphs(key: string | undefined) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-morph]")) {
    el.style.viewTransitionName = el.dataset.morphKey === key ? `morph-${el.dataset.morph}` : "";
  }
}
