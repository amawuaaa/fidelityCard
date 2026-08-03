import { BRAND } from "./brand.js";

/** Paleta arcoíris para el demo "Prism" */
export const RAINBOW_COLORS = [
  "#C084FC",
  "#FACC15",
  "#EF4444",
  "#F472B6",
  "#16A34A",
  "#38BDF8",
];

export const RAINBOW_GRADIENT =
  "linear-gradient(135deg, #C084FC 0%, #FACC15 20%, #EF4444 40%, #F472B6 60%, #16A34A 80%, #38BDF8 100%)";

/**
 * Catálogo demo / pitch.
 * themeStyle: solid | rainbow | bakery
 * Los de group "target" son FICTICIOS (muestran personalización fuerte).
 */
export const DEMO_CAFES = [
  {
    name: "Café Demo",
    slug: "cafe-demo",
    brandColor: "#178e3c",
    stampsRequired: 6,
    tagline: "Especialidad de barrio",
    taglineEn: "Neighborhood specialty",
    rewardLabel: "1 café gratis",
    rewardLabelEn: "1 free coffee",
    themeStyle: "solid",
    group: "demo",
  },
  {
    name: "Bean & Co",
    slug: "bean-co",
    brandColor: "#B45309",
    stampsRequired: 6,
    tagline: "Espresso & community",
    taglineEn: "Espresso & community",
    rewardLabel: "1 bebida a elegir",
    rewardLabelEn: "1 drink of your choice",
    themeStyle: "solid",
    group: "demo",
  },
  {
    name: "Norte",
    slug: "norte",
    brandColor: "#0E7490",
    stampsRequired: 8,
    tagline: "Origen y tueste",
    taglineEn: "Origin & roast",
    rewardLabel: "1 filter gratis",
    rewardLabelEn: "1 free filter",
    themeStyle: "solid",
    group: "demo",
  },
  {
    name: "Prism Café",
    slug: "prism",
    brandColor: "#EF4444",
    stampsRequired: 6,
    tagline: "Café con color",
    taglineEn: "Coffee in color",
    rewardLabel: "1 café gratis",
    rewardLabelEn: "1 free coffee",
    themeStyle: "rainbow",
    group: "target",
  },
  {
    name: "Hearth Bakery",
    slug: "hearth",
    brandColor: "#44403C",
    stampsRequired: 8,
    tagline: "Pan y café de mañana",
    taglineEn: "Bread & morning coffee",
    rewardLabel: "1 café o pan",
    rewardLabelEn: "1 coffee or pastry",
    themeStyle: "bakery",
    group: "target",
  },
];

/** Traducciones rápidas de textos de café conocidos (DB en ES). */
const COPY_EN = {
  "Especialidad de barrio": "Neighborhood specialty",
  "Café con color": "Coffee in color",
  "Pan y café de mañana": "Bread & morning coffee",
  "Origen y tueste": "Origin & roast",
  "1 café gratis": "1 free coffee",
  "1 bebida a elegir": "1 drink of your choice",
  "1 filter gratis": "1 free filter",
  "1 café o pan": "1 coffee or pastry",
  "tu café gratis": "your free coffee",
};

export function getDemoCafe(slug) {
  return DEMO_CAFES.find((c) => c.slug === slug) || null;
}

/** Devuelve tagline + reward en el idioma activo. */
export function localizeCafeCopy(slug, tagline, rewardLabel, lang = "es") {
  const demo = getDemoCafe(slug);
  if (lang === "en") {
    return {
      tagline:
        demo?.taglineEn ||
        COPY_EN[tagline] ||
        tagline ||
        BRAND.tagline,
      rewardLabel:
        demo?.rewardLabelEn ||
        COPY_EN[rewardLabel] ||
        rewardLabel ||
        BRAND.rewardLabel,
    };
  }
  return {
    tagline: tagline || demo?.tagline || BRAND.tagline,
    rewardLabel: rewardLabel || demo?.rewardLabel || BRAND.rewardLabel,
  };
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
