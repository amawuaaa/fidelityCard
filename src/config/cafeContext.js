import { BRAND } from "./brand.js";

const CAFE_SLUG_KEY = "stamp_cafe_slug";

/**
 * Resuelve el slug del café activo:
 * 1) ?cafe= / &u= en la URL
 * 2) localStorage
 * 3) default brand
 */
export function getActiveCafeSlug() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("cafe") || params.get("c");
    if (fromQuery) {
      localStorage.setItem(CAFE_SLUG_KEY, fromQuery);
      return fromQuery;
    }
  } catch {
    // ignore
  }

  const stored = localStorage.getItem(CAFE_SLUG_KEY);
  if (stored) return stored;

  return BRAND.cafeSlug;
}

export function setActiveCafeSlug(slug) {
  if (!slug) return;
  localStorage.setItem(CAFE_SLUG_KEY, slug);
}

/** Extrae usr_… también desde ?u= de la URL (deep link del QR). */
export function getPublicIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("u") || params.get("user") || null;
  } catch {
    return null;
  }
}

/**
 * URL del QR del cliente: abre la tarjeta en ese café con su ID.
 * Más fácil de escanear y útil como deep link.
 */
export function buildCustomerQrValue(publicId, cafeSlug = getActiveCafeSlug()) {
  const url = new URL(window.location.origin);
  url.searchParams.set("cafe", cafeSlug);
  url.searchParams.set("u", publicId);
  return url.toString();
}
