import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LOCALE_LABELS, type Locale, translations } from "@/i18n/translations";

type TranslateOptions = {
  fallback?: string;
  values?: Record<string, string | number>;
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, options?: TranslateOptions) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  localeLabels: Record<Locale, string>;
};

const STORAGE_KEY = "ss_locale";

const I18nContext = createContext<I18nContextValue | null>(null);

const normalizeKey = (key: string) => key.split(".").filter(Boolean);

const getTranslation = (locale: Locale, key: string): string | undefined => {
  const parts = normalizeKey(key);
  let current: any = translations[locale];
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
};

const interpolate = (template: string, values?: Record<string, string | number>) => {
  if (!values) return template;
  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }, template);
};

const parseStoredLocale = (): Locale => {
  if (typeof window === "undefined") {
    return "en";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && stored in translations) {
    return stored as Locale;
  }
  return "en";
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<Locale>(() => parseStoredLocale());

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, options?: TranslateOptions) => {
      const translation = getTranslation(locale, key) ?? getTranslation("en", key) ?? options?.fallback ?? key;
      return interpolate(translation, options?.values);
    };

    const formatDate = (value: string | Date, options?: Intl.DateTimeFormatOptions) => {
      const date = typeof value === "string" ? new Date(value) : value;
      return new Intl.DateTimeFormat(locale, options ?? { year: "numeric", month: "short", day: "numeric" }).format(date);
    };

    const formatDateTime = (value: string | Date, options?: Intl.DateTimeFormatOptions) => {
      const date = typeof value === "string" ? new Date(value) : value;
      return new Intl.DateTimeFormat(
        locale,
        options ?? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      ).format(date);
    };

    const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value);

    return {
      locale,
      setLocale,
      t,
      formatDate,
      formatDateTime,
      formatNumber,
      localeLabels: LOCALE_LABELS
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
};
