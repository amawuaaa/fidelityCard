import { BRAND } from "./brand.js";

/** Catálogo de cafés demo para el pitch (mismas filas en Supabase). */
export const DEMO_CAFES = [
  {
    name: "Café Demo",
    slug: "cafe-demo",
    brandColor: "#178e3c",
    stampsRequired: 6,
    tagline: "Especialidad de barrio",
    rewardLabel: "1 café gratis",
  },
  {
    name: "Bean & Co",
    slug: "bean-co",
    brandColor: "#B45309",
    stampsRequired: 6,
    tagline: "Espresso & community",
    rewardLabel: "1 bebida a elegir",
  },
  {
    name: "Norte",
    slug: "norte",
    brandColor: "#0E7490",
    stampsRequired: 8,
    tagline: "Origen y tueste",
    rewardLabel: "1 filter gratis",
  },
];

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Oscurece un hex (~18% por defecto) para hover. */
export function darkenHex(hex, amount = 0.18) {
  const raw = String(hex || "")
    .replace("#", "")
    .trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return BRAND.colorHover;

  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const f = 1 - amount;

  return `#${[r, g, b]
    .map((c) => clamp(c * f).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Aplica el color del café a toda la UI (botones, sellos, badges). */
export function applyBrandToDocument(color = BRAND.color) {
  const root = document.documentElement;
  const brand = color || BRAND.color;
  root.style.setProperty("--brand", brand);
  root.style.setProperty("--brand-hover", darkenHex(brand));
}

export function brandStyle(color = BRAND.color) {
  const brand = color || BRAND.color;
  return {
    "--brand": brand,
    "--brand-hover": darkenHex(brand),
  };
}
