import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MESSAGES } from "./messages.js";

const STORAGE_KEY = "cuptrack_lang";
const LanguageContext = createContext(null);

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // ignore
  }
  const nav = (navigator.language || "es").toLowerCase();
  return nav.startsWith("en") ? "en" : "es";
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  const setLang = useCallback((next) => {
    const value = next === "en" ? "en" : "es";
    setLangState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "es" ? "en" : "es");
  }, [lang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      const table = MESSAGES[lang] || MESSAGES.es;
      const fallback = MESSAGES.es[key] || key;
      const raw = table[key] ?? fallback;
      return vars ? interpolate(raw, vars) : raw;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLang must be used within LanguageProvider");
  }
  return ctx;
}

export function useT() {
  return useLang().t;
}
