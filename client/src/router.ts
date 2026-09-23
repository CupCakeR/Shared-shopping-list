import { computed, signal } from "@preact/signals";
import { parseRoute } from "./routes";

export * from "./routes";

const path = signal(location.pathname);
export const route = computed(() => parseRoute(path.value));

window.addEventListener("popstate", () => (path.value = location.pathname));

export function navigate(to: string, { replace = false } = {}) {
  if (to !== location.pathname) {
    // inApp marks entries we pushed, so back() knows whether history.back() stays inside the app.
    if (replace) history.replaceState(history.state, "", to);
    else history.pushState({ inApp: true }, "", to);
  }
  path.value = to;
  window.scrollTo(0, 0);
}

/** Like the browser's back, but lands on the home screen when the app was opened on a deep link. */
export function back() {
  if (history.state?.inApp) history.back();
  else navigate("/", { replace: true });
}
