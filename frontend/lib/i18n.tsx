"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "ru" | "en";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  tr: (ru: string, en: string) => string;
  dateLocale: string;
  statusLabel: (status: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  useEffect(() => {
    const saved = window.localStorage.getItem("dosetrack_language");
    if (saved === "en" || saved === "ru") setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("dosetrack_language", next);
  }, []);

  const tr = useCallback((ru: string, en: string) => (locale === "ru" ? ru : en), [locale]);
  const statusLabel = useCallback(
    (status: string) => {
      const labels: Record<string, [string, string]> = {
        PENDING: ["Ожидается", "Pending"],
        TAKEN: ["Принято", "Taken"],
        SKIPPED: ["Пропущено", "Skipped"],
        ACTIVE: ["Активен", "Active"],
        PAUSED: ["Приостановлен", "Paused"],
        COMPLETED: ["Завершён", "Completed"],
        ARCHIVED: ["В архиве", "Archived"]
      };
      const pair = labels[status.toUpperCase()];
      return pair ? (locale === "ru" ? pair[0] : pair[1]) : status;
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, tr, dateLocale: locale === "ru" ? "ru-RU" : "en-US", statusLabel }),
    [locale, setLocale, tr, statusLabel]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
