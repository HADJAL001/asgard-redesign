"use client"

/* ================================================================
   OSGARD · i18n — минимальная система интернационализации
   ----------------------------------------------------------------
   - Поддерживаемые языки: ru (по умолчанию), en, kz
   - Определение языка: localStorage("osgard-lang") → navigator.language → "ru"
   - t(key, vars?) — достаёт строку по ключу вида "wallet.title" из
     соответствующего JSON-словаря и подставляет {{var}} на значения vars.
   - Если ключ не найден в текущем языке — fallback на ru, затем сам ключ.
   ================================================================ */

import ru from "./locales/ru.json"
import en from "./locales/en.json"
import kz from "./locales/kz.json"

export type Locale = "ru" | "en" | "kz"

export const LOCALES: Locale[] = ["ru", "en", "kz"]

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  kz: "Қазақша",
}

export const LOCALE_SHORT: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
  kz: "KZ",
}

const DICTS: Record<Locale, Record<string, unknown>> = { ru, en, kz }

const STORAGE_KEY = "osgard-lang"

const DEFAULT_LOCALE: Locale = "ru"

/** Событие смены языка, чтобы синхронизировать все подписанные компоненты. */
export const LANG_CHANGE_EVENT = "osgard-lang-change"

/** Определяет язык при загрузке: localStorage → navigator.language → ru. */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE

  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved && LOCALES.includes(saved as Locale)) return saved as Locale

  const nav = window.navigator?.language?.slice(0, 2).toLowerCase()
  if (nav === "en") return "en"
  if (nav === "kk" || nav === "kz") return "kz"
  return DEFAULT_LOCALE
}

/** Сохраняет выбранный язык и уведомляет подписчиков. */
export function setLocale(locale: Locale) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, locale)
  window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: locale }))
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const v = vars[key]
    return v === undefined ? match : String(v)
  })
}

/**
 * Достаёт переведённую строку по ключу вида "namespace.key" для указанного
 * языка. При отсутствии перевода — fallback на русский, затем сам ключ.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE]
  const value = getByPath(dict, key)
  if (typeof value === "string") return interpolate(value, vars)

  if (locale !== DEFAULT_LOCALE) {
    const fallback = getByPath(DICTS[DEFAULT_LOCALE], key)
    if (typeof fallback === "string") return interpolate(fallback, vars)
  }

  return key
}
