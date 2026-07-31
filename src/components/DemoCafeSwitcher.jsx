import { DEMO_CAFES } from "../config/theme.js";

/**
 * Selector de cafés demo para el pitch: misma app, cara distinta.
 */
export default function DemoCafeSwitcher({ activeSlug }) {
  return (
    <section className="mt-8 rounded-3xl bg-white p-4 shadow-sm">
      <p className="text-center text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
        Prueba 3 cafés demo
      </p>
      <p className="mt-1 text-center text-xs font-medium text-gray-500">
        Mismo sistema · colores y reglas distintas
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {DEMO_CAFES.map((cafe) => {
          const active = cafe.slug === activeSlug;
          return (
            <a
              key={cafe.slug}
              href={`/?cafe=${cafe.slug}`}
              className={[
                "rounded-2xl px-2 py-3 text-center transition",
                active
                  ? "text-white shadow-sm"
                  : "bg-stone-50 text-gray-700 ring-1 ring-stone-200 hover:bg-stone-100",
              ].join(" ")}
              style={active ? { backgroundColor: cafe.brandColor } : undefined}
            >
              <span
                className="mx-auto mb-1.5 block size-2.5 rounded-full"
                style={{
                  backgroundColor: active ? "#fff" : cafe.brandColor,
                }}
                aria-hidden
              />
              <span className="block text-[11px] font-extrabold leading-tight">
                {cafe.name}
              </span>
              <span
                className={[
                  "mt-0.5 block text-[10px] font-semibold",
                  active ? "text-white/80" : "text-gray-400",
                ].join(" ")}
              >
                {cafe.stampsRequired} sellos
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
