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
    setCookie(key);
    if (key && document.visibilityState === "visible") open();
  });
  // Phones kill background connections anyway, so drop it ourselves and reconnect on return.
  document.addEventListener("visibilitychange", () => {
    const key = session.value?.key;
    if (document.visibilityState !== "visible") close();
    else if (key && !source) open();
  });
}

/**
 * EventSource can't send the Authorization header, so the key goes in a cookie only sent to the stream.
 * Set from here rather than by the server: the key is in localStorage anyway, so HttpOnly wouldn't hide it,
 * and the stream doesn't have to wait for another request to set it.
 */
function setCookie(key: string | undefined) {
  const attrs = `Path=/api/events; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
  document.cookie = key ? `key=${encodeURIComponent(key)}; Max-Age=31536000; ${attrs}` : `key=; Max-Age=0; ${attrs}`;
}

function open() {
  // EventSource reconnects on its own after network errors. A 401 closes it for good,
  // and the next sync logs out.
  source = new EventSource("/api/events");
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
