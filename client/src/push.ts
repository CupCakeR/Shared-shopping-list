import { effect, signal } from "@preact/signals";
import type { PushSubscriptionInput } from "../../shared/types";
import { fetchPushInfo, postPushSubscribe, postPushUnsubscribe, postShopping } from "./api";
import { session } from "./session";

/**
 * - dev: no service worker in `vite dev` (see main.tsx), so no push either
 * - install: iOS only does push from the home screen app, not in a Safari tab
 * - unsupported: the browser can't
 * - unavailable: the server has no VAPID keys
 * - denied: the user blocked notifications for the site
 */
export type PushState = "loading" | "dev" | "install" | "unsupported" | "unavailable" | "denied" | "off" | "on";

export const pushState = signal<PushState>("loading");
/** The server's VAPID public key. undefined until known (offline), null when push is off on the server. */
export const pushKey = signal<string | null | undefined>(undefined);

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true);

function browserState(): PushState | null {
  if (!import.meta.env.PROD) return "dev";
  if (isIos() && !isStandalone()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return null;
}

const subscription = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();

const toInput = (sub: PushSubscription) => sub.toJSON() as PushSubscriptionInput;

/** VAPID keys are base64url, PushManager wants the raw bytes. */
function keyBytes(key: string) {
  const b64 = key.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, key: string) {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(key);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Works out the state on login and app start, and re-sends an existing subscription: the server may have lost it
 * (new database) or it belongs to whoever was logged in before on this device.
 */
export function startPush() {
  effect(() => {
    const key = session.value?.key;
    if (key) void refresh(key);
  });
}

async function refresh(key: string) {
  pushKey.value = await fetchPushInfo(key).then(
    (info) => info.publicKey,
    () => undefined,
  );
  const blocked = browserState();
  if (blocked) return void (pushState.value = blocked);

  const sub = await subscription();
  if (pushKey.value === null) {
    pushState.value = "unavailable";
    return;
  }
  // New VAPID keys on the server: the old subscription can't receive anything anymore.
  if (sub && pushKey.value && !sameKey(sub, pushKey.value)) {
    await sub.unsubscribe();
    pushState.value = "off";
    return;
  }
  pushState.value = sub ? "on" : "off";
  if (sub && pushKey.value) await postPushSubscribe(key, toInput(sub)).catch(() => {});
}

export async function enablePush() {
  const key = session.value?.key;
  const publicKey = pushKey.value;
  if (!key || !publicKey) return;
  // Has to be the first await: Safari only asks while the tap that got us here still counts.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    pushState.value = permission === "denied" ? "denied" : "off";
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  try {
    await postPushSubscribe(key, toInput(sub));
  } catch (err) {
    // The server doesn't know it, so don't pretend it's on.
    await sub.unsubscribe();
    throw err;
  }
  pushState.value = "on";
}

/** Stops push on this device. The browser side always goes, the server side is best effort. */
export async function disablePush() {
  if (pushState.value !== "on") return;
  const key = session.value?.key;
  const sub = await subscription();
  if (sub) {
    await sub.unsubscribe();
    if (key) await postPushUnsubscribe(key, sub.endpoint).catch(() => {});
  }
  pushState.value = "off";
}

export async function goingShopping() {
  const key = session.value?.key;
  if (key) await postShopping(key);
}
