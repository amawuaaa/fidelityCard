/**
 * Configuración de marca — CupTrack
 *
 * Producción: https://www.cuptrack.com
 * Cliente → /?cafe=<slug>
 * Staff   → /#admin
 *
 * Demo pitch: VITE_DEMO=true (muestra switcher de cafés)
 */
const demoFlag = String(import.meta.env.VITE_DEMO || "")
  .toLowerCase()
  .trim();

export const BRAND = {
  productName: "CupTrack",
  productTagline: "Fidelidad para cafeterías",
  cafeName: "Café Demo",
  cafeSlug: "cafe-demo",
  color: "#178e3c",
  colorHover: "#136f2f",
  stampsRequired: 6,
  tagline: "Especialidad de barrio",
  rewardLabel: "1 café gratis",
  storageKey: "stamp_customer_id",
  /** Solo true si VITE_DEMO=true | 1 | yes */
  isDemo: demoFlag === "true" || demoFlag === "1" || demoFlag === "yes",
};
