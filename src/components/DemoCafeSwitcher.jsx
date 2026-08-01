import { DEMO_CAFES, RAINBOW_GRADIENT } from "../config/theme.js";
import { useT } from "../i18n/LanguageContext.jsx";

function CafeChip({ cafe, active, t }) {
  const rainbow = cafe.themeStyle === "rainbow";
  const activeStyle = active
    ? rainbow
      ? { backgroundImage: RAINBOW_GRADIENT }
      : { backgroundColor: cafe.brandColor }
    : undefined;

  return (
    <a
      href={`/?cafe=${cafe.slug}`}
      className={[
        "rounded-2xl px-2 py-3 text-center transition",
        active
          ? "text-white shadow-sm"
          : "bg-stone-50 text-gray-700 ring-1 ring-stone-200 hover:bg-stone-100",
      ].join(" ")}
      style={activeStyle}
    >
      <span
        className="mx-auto mb-1.5 block size-2.5 rounded-full"
        style={
          active
            ? { backgroundColor: "#fff" }
            : rainbow
              ? { backgroundImage: RAINBOW_GRADIENT }
              : { backgroundColor: cafe.brandColor }
        }
        aria-hidden
      />
      <span className="block text-[11px] font-extrabold leading-tight">
        {cafe.name}
      </span>
      <span
        className={[
          "mt-0.5 block text-[10px] font-semibold",
          active ? "text-white/85" : "text-gray-400",
        ].join(" ")}
      >
        {t("demo.stamps", { n: cafe.stampsRequired })}
        {rainbow ? ` · ${t("demo.rainbow")}` : ""}
      </span>
    </a>
  );
}

/**
 * Selector de cafés demo + objetivos de pitch.
 */
export default function DemoCafeSwitcher({ activeSlug }) {
  const t = useT();
  const targets = DEMO_CAFES.filter((c) => c.group === "target");
  const demos = DEMO_CAFES.filter((c) => c.group === "demo");

  return (
    <section className="mt-8 space-y-3">
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-center text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
          {t("demo.targets")}
        </p>
        <p className="mt-1 text-center text-xs font-medium text-gray-500">
          {t("demo.targetsHint")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {targets.map((cafe) => (
            <CafeChip
              key={cafe.slug}
              cafe={cafe}
              active={cafe.slug === activeSlug}
              t={t}
            />
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-center text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
          {t("demo.more")}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {demos.map((cafe) => (
            <CafeChip
              key={cafe.slug}
              cafe={cafe}
              active={cafe.slug === activeSlug}
              t={t}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
