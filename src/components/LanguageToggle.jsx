import { useLang } from "../i18n/LanguageContext.jsx";

/**
 * Interruptor compacto ES / EN.
 */
export default function LanguageToggle({ className = "" }) {
  const { lang, setLang, t } = useLang();

  return (
    <div
      className={[
        "inline-flex items-center rounded-full bg-white/90 p-0.5 text-[11px] font-extrabold shadow-sm ring-1 ring-stone-200",
        className,
      ].join(" ")}
      role="group"
      aria-label={t("lang.switch")}
    >
      <button
        type="button"
        onClick={() => setLang("es")}
        className={[
          "rounded-full px-2.5 py-1 transition",
          lang === "es" ? "bg-brand text-white" : "text-gray-500 hover:text-gray-800",
        ].join(" ")}
        aria-pressed={lang === "es"}
      >
        {t("lang.es")}
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={[
          "rounded-full px-2.5 py-1 transition",
          lang === "en" ? "bg-brand text-white" : "text-gray-500 hover:text-gray-800",
        ].join(" ")}
        aria-pressed={lang === "en"}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}
