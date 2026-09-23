// Service worker: keeps the built app in a cache so it opens without a connection. Data isn't
// cached here, it lives in IndexedDB, and /api always goes to the network.

// A module, so this `self` shadows the global one (typed as a plain worker) instead of clashing with it.
export {};

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

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
