/* eslint-env serviceworker */
/**
 * Service worker mínimo de CupTrack.
 *
 * Hace dos cosas y nada más:
 *  1. Chrome/Android solo ofrece "Instalar app" si existe un SW con fetch.
 *  2. Si el wifi del local falla, la cartilla abre igual en vez de pantalla
 *     en blanco (los sellos se sincronizan al volver la conexión).
 *
 * NUNCA cachea llamadas a Supabase: los sellos tienen que ser frescos.
 */

const CACHE = "cuptrack-v1";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Solo mismo origen. Supabase, fuentes y cualquier API quedan fuera.
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero, cascarón cacheado si no hay conexión.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // Assets con hash en el nombre: inmutables, cache primero.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
