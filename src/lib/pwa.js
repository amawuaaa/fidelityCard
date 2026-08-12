/**
 * PWA: registro del service worker y manifest por cafetería.
 *
 * El manifest estático abre siempre en "/", así que una cartilla instalada
 * desde ?cafe=bean-co perdía el café en cuanto se limpiaba localStorage, y
 * el icono se llamaba "CupTrack" en vez del nombre del local.
 *
 * Aquí se reescribe el manifest en caliente con los datos reales del café.
 */

let blobUrl = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW no registrado:", err);
    });
  });
}

/**
 * Sustituye el manifest por uno con el nombre, color y start_url del café.
 * En iOS también actualiza el título que se usa al añadir a la pantalla
 * de inicio, que es la ruta que más usan los clientes.
 */
export function applyCafeManifest({ cafeName, cafeSlug, brandColor }) {
  if (typeof document === "undefined" || !cafeSlug) return;

  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return;

  const name = cafeName || "CupTrack";
  const color = brandColor || "#178e3c";
  const abs = (path) => new URL(path, window.location.origin).href;

  const manifest = {
    name: `${name} · Fidelidad`,
    short_name: name.slice(0, 12),
    description: `Tu tarjeta de fidelidad de ${name}`,
    start_url: `/?cafe=${encodeURIComponent(cafeSlug)}`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: color,
    icons: [
      { src: abs("/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: abs("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: abs("/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  try {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }),
    );
    link.href = blobUrl;

    const appleTitle = document.querySelector(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (appleTitle) appleTitle.setAttribute("content", name);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", color);
  } catch (err) {
    console.error("Manifest dinámico no aplicado:", err);
  }
}
