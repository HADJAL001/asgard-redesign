"use client"

/* ================================================================
   OSGARD · useTranslation — React-хук и провайдер для i18n
   ----------------------------------------------------------------
   - I18nProvider держит текущий язык (Locale) в состоянии, читает его
     при монтировании через detectLocale() и подписывается на событие
     LANG_CHANGE_EVENT, чтобы все компоненты обновились при смене языка
     (например, из переключателя в navbar.tsx).
   - useTranslation() возвращает { locale, setLocale, t }, где
     t(key, vars?) — функция перевода (см. lib/i18n/index.ts).
   - Компонент, вызывающий useTranslation(), должен находиться внутри
     <I18nProvider> (подключён в app/layout.tsx).
   ================================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  type Locale,
  detectLocale,
  setLocale as persistLocale,
  translate,
  LANG_CHANGE_EVENT,
} from "./index"

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    typeof window === "undefined" ? "ru" : detectLocale(),
  )

  useEffect(() => {
    function handleChange(e: Event) {
      const detail = (e as CustomEvent<Locale>).detail
      if (detail) setLocaleState(detail)
    }

    window.addEventListener(LANG_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handleChange)
  }, [])

  const changeLocale = useCallback((next: Locale) => {
    persistLocale(next)
    setLocaleState(next)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale: changeLocale, t }), [locale, changeLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Хук перевода. Должен использоваться внутри <I18nProvider>. */
export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error("useTranslation() must be used within <I18nProvider>")
  }
  return ctx
}
