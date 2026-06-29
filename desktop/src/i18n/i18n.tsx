import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";

export type Language = "en" | "zh-CN";
export type TranslationKey = keyof typeof en;
type Dictionary = Record<TranslationKey, string>;

const storageKey = "modelgate.language";
const dictionaries: Record<Language, Dictionary> = {
  en,
  "zh-CN": zhCN
};

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "zh-CN";
}

function initialLanguage(): Language {
  const stored = window.localStorage.getItem(storageKey);
  if (isLanguage(stored)) {
    return stored;
  }

  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function interpolate(value: string, params?: Record<string, string | number>) {
  if (!params) {
    return value;
  }

  return Object.entries(params).reduce(
    (current, [key, replacement]) => current.split(`{${key}}`).join(String(replacement)),
    value
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage());

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage(nextLanguage) {
      window.localStorage.setItem(storageKey, nextLanguage);
      setLanguageState(nextLanguage);
    },
    t(key, params) {
      return interpolate(dictionaries[language][key] ?? dictionaries.en[key] ?? key, params);
    }
  }), [language]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
