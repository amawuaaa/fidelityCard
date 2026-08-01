import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { useT } from "../i18n/LanguageContext.jsx";

const DISMISS_KEY = "cuptrack_install_hint_dismissed";

function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Tip breve para añadir CupTrack a la pantalla de inicio (PWA).
 */
export default function InstallHint() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="mt-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-gray-900">
            {t("install.title")}
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500">
            {isAppleMobile() ? (
              <>
                {t("install.iosPrefix")}{" "}
                <Share
                  className="inline size-3.5 align-[-2px] text-brand"
                  strokeWidth={2.5}
                />{" "}
                {t("install.iosSuffix")}{" "}
                <span className="font-bold">{t("install.iosAction")}</span>
              </>
            ) : (
              <>
                {t("install.androidMenu")}{" "}
                <span className="font-bold">{t("install.androidInstall")}</span>{" "}
                {t("install.androidOr")}{" "}
                <span className="font-bold">{t("install.androidHome")}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full p-1.5 text-gray-400 hover:bg-stone-100 hover:text-gray-600"
          aria-label={t("install.close")}
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
