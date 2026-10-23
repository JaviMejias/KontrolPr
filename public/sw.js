const VERSION = "kontrolpr-static-__BUILD_VERSION__";
const STATIC_ASSETS = __PRECACHE_ASSETS__;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: "reload" })))));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("kontrolpr-static-") && key !== VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) return client.focus();
    return self.clients.openWindow("/");
  }));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("authorization")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })).catch(async () => (await caches.open(VERSION)).match("/index.html").then((cached) => cached || Response.error())));
    return;
  }
  if (!STATIC_ASSETS.includes(url.pathname) || url.search) return;
  event.respondWith(caches.open(VERSION).then(async (cache) => (await cache.match(request)) || fetch(request)));
});
