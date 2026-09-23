import { effect } from "@preact/signals";
import { session } from "./session";
import { getLocal } from "./state";
import { runSync } from "./sync";

let source: EventSource | undefined;

/**
 * Keeps an SSE connection open while logged in and the app is visible. The server nudges with its rev
 * on connect and after every change, and we sync whenever that differs from our cursor.
 */
export function startLiveUpdates() {
  effect(() => {
    const key = session.value?.key;
    close();
    if (key && document.visibilityState === "visible") open(key);
  });
  // Phones kill background connections anyway, so drop it ourselves and reconnect on return.
  document.addEventListener("visibilitychange", () => {
    const key = session.value?.key;
    if (document.visibilityState !== "visible") close();
    else if (key && !source) open(key);
  });
}

function open(key: string) {
  // EventSource reconnects on its own after network errors. A 401 closes it for good,
  // and the next sync logs out.
  source = new EventSource(`/api/events?key=${encodeURIComponent(key)}`);
  source.addEventListener("changed", async (e) => {
    const rev = Number(e.data);
    const cursor = (await getLocal().get("meta", "cursor")) ?? 0;
    // Not just "ahead": a server rev behind our cursor means the DB was reset.
    if (rev !== cursor) runSync();
  });
}

function close() {
  source?.close();
  source = undefined;
}
