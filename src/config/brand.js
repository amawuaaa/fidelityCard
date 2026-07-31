/**
 * Configuración de marca — Demo multi-cafetería
 *
 * Cada café real vive en Supabase (nombre, color, sellos, tagline).
 * Ver DEMO_CAFES en theme.js y supabase/demo_cafes.sql
 *
 * Cliente A → /?cafe=cafe-demo
 * Cliente B → /?cafe=bean-co
 * Cliente C → /?cafe=norte
 * Staff     → /#admin
 */
export const BRAND = {
  productName: "Stamp",
  productTagline: "Fidelidad para cafeterías",
  cafeName: "Café Demo",
  cafeSlug: "cafe-demo",
  color: "#178e3c",
  colorHover: "#136f2f",
  stampsRequired: 6,
  tagline: "Especialidad de barrio",
  rewardLabel: "1 café gratis",
  storageKey: "stamp_customer_id",
  isDemo: true,
};
