// Service worker: keeps the built app in a cache so it opens without a connection. Data isn't
// cached here, it lives in IndexedDB, and /api always goes to the network. Also shows push notifications.

import type { PushMessage } from "../../shared/types";

declare const self: ServiceWorkerGlobalScope & {
  /** Filled in at build time by vite-plugin-pwa: every file of the build, with a hash for unhashed ones. */
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

const manifest = self.__WB_MANIFEST; // exactly once, the build replaces this reference
// Icons come in twice (files and web manifest), and cache.addAll rejects duplicates.
const files = [...new Set(manifest.map((e) => `/${e.url.replace(/^\//, "")}`))];
// A new build gets a new cache, so an update never mixes files from two builds.
const CACHE = `app-${hash(JSON.stringify(manifest))}`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(files.map((url) => new Request(url, { cache: "reload" })));
      // Take over right away. The open page keeps its files and loads the new build on the next start.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Every page is the same app shell, the client routes itself.
  const key = e.request.mode === "navigate" ? "/index.html" : e.request;
  e.respondWith(caches.match(key, { cacheName: CACHE }).then((hit) => hit ?? fetch(e.request)));
});

self.addEventListener("push", (e) => {
  const message = e.data?.json() as PushMessage | undefined;
  if (!message) return;
  e.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      // Buzz again when a newer push replaces one with the same tag, instead of swapping it silently.
      renotify: true,
      icon: "/icon-192.png",
      data: { url: message.url },
    } as NotificationOptions),
  );
});

/** Brings the app to the front on the notification's page, opening it if it isn't running. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data as { url?: string } | null)?.url ?? "/", location.origin).href;
  e.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (!open) return void (await self.clients.openWindow(url));
      await open.focus();
      if (open.url !== url) await open.navigate(url);
    })(),
  );
});

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
