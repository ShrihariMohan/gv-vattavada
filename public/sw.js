const CACHE = "vbm-shell-v3";
const PRECACHE = [
  "/",
  "/royal-residency",
  "/cloudy-glenn",
  "/cloudy-kitchen",
  "/car-rental",
  "/login",
  "/dashboard",
  "/pos",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING" || data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data?.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "vbm-sync") {
    event.waitUntil(notifyClients({ type: "FLUSH_SYNC" }));
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "vbm-sync") {
    event.waitUntil(notifyClients({ type: "FLUSH_SYNC" }));
  }
});

function notifyClients(message) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage(message);
  });
}

async function networkFirst(request, fallbackUrl) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      const cache = await caches.open(CACHE);
      await cache.put(request, copy);
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const offline = await caches.match(fallbackUrl);
      if (offline) return offline;
    }
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "/offline.html"));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return net.then((res) => res || cached);
    }),
  );
});
