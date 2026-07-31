import { BRAND } from "./brand.js";

/** Paleta arcoíris inspirada en the Layers */
export const RAINBOW_COLORS = [
  "#C084FC", // lavanda (L)
  "#FACC15", // amarillo (A)
  "#EF4444", // rojo (Y)
  "#F472B6", // rosa (E)
  "#16A34A", // verde (R)
  "#38BDF8", // cielo (S)
];

export const RAINBOW_GRADIENT =
  "linear-gradient(135deg, #C084FC 0%, #FACC15 20%, #EF4444 40%, #F472B6 60%, #16A34A 80%, #38BDF8 100%)";

/**
 * Catálogo demo / pitch.
 * themeStyle: solid | rainbow | bakery
 */
export const DEMO_CAFES = [
  {
    name: "Café Demo",
    slug: "cafe-demo",
    brandColor: "#178e3c",
    stampsRequired: 6,
    tagline: "Especialidad de barrio",
    rewardLabel: "1 café gratis",
    themeStyle: "solid",
    group: "demo",
  },
  {
    name: "Bean & Co",
    slug: "bean-co",
    brandColor: "#B45309",
    stampsRequired: 6,
    tagline: "Espresso & community",
    rewardLabel: "1 bebida a elegir",
    themeStyle: "solid",
    group: "demo",
  },
  {
    name: "Norte",
    slug: "norte",
    brandColor: "#0E7490",
    stampsRequired: 8,
    tagline: "Origen y tueste",
    rewardLabel: "1 filter gratis",
    themeStyle: "solid",
    group: "demo",
  },
  {
    name: "the Layers",
    slug: "layers",
    brandColor: "#EF4444",
    stampsRequired: 6,
    tagline: "Café con capas de color",
    rewardLabel: "1 café gratis",
    themeStyle: "rainbow",
    group: "target",
  },
  {
    name: "ETMA Bakery",
    slug: "etma",
    brandColor: "#44403C",
    stampsRequired: 8,
    tagline: "Bagels & breakfast",
    rewardLabel: "1 café o bagel",
    themeStyle: "bakery",
    group: "target",
  },
];

export function getDemoCafe(slug) {
  return DEMO_CAFES.find((c) => c.slug === slug) || null;
}

export function resolveThemeStyle(slug, fromDb) {
  const fromCatalog = getDemoCafe(slug)?.themeStyle;
  if (fromCatalog && fromCatalog !== "solid") return fromCatalog;
  return fromDb || fromCatalog || "solid";
}

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

/** Aplica color + estilo visual del café a toda la UI. */
export function applyBrandToDocument(
  color = BRAND.color,
  themeStyle = "solid",
) {
  const root = document.documentElement;
  const brand = color || BRAND.color;
  root.style.setProperty("--brand", brand);
  root.style.setProperty("--brand-hover", darkenHex(brand));
  root.dataset.theme = themeStyle || "solid";

  if (themeStyle === "bakery") {
    root.style.setProperty("--page-bg", "#F5F0E6");
  } else if (themeStyle === "rainbow") {
    root.style.setProperty("--page-bg", "#FFFBF5");
  } else {
    root.style.setProperty("--page-bg", "#fafaf9");
  }
}

export function brandStyle(color = BRAND.color) {
  const brand = color || BRAND.color;
  return {
    "--brand": brand,
    "--brand-hover": darkenHex(brand),
  };
}

export function stampFillStyle(themeStyle, index) {
  if (themeStyle === "rainbow") {
    return { backgroundColor: RAINBOW_COLORS[index % RAINBOW_COLORS.length] };
  }
  return undefined;
}
