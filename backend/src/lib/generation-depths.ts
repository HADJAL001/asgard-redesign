/* ================================================================
   OSGARD · Глубина генерации проекта (per-generation billing)
   ----------------------------------------------------------------
   Три честных уровня, каждый — реально другой путь в коде генерации,
   а не косметика:

     quick    — шаблон-первый (findBestTemplate). Может переиспользовать
                кешированный шаблон/результат. Самый дешёвый путь, идёт
                в счёт бесплатной дневной квоты тарифа. 0 кредитов.
     standard — пропускает шаблонный shortcut → полная AI-генерация
                (generateApp). Кеш идентичных промптов допускается.
                Платно, дневную квоту не тратит.
     deep     — полная AI-генерация + обход durableCache: гарантированно
                свежий манифест и файлы с нуля (максимум токенов).
                Дороже всего.

   Экономические различия завязаны на РЕАЛЬНЫЕ ветки: forceAi
   (шаблон vs generateApp) и bypassCache (свежесть). Кредиты
   списываются честно в маршруте, с возвратом при сбое.
   ================================================================ */

export type GenerationDepth = "quick" | "standard" | "deep"

export type GenerationDepthConfig = {
  id: GenerationDepth
  label: string
  description: string
  /** Стоимость в кредитах. quick = 0 (идёт в счёт дневной квоты). */
  credits: number
  /** Доплата за AI-глубину в TimeCoin. Credits не оплачивают генерации. */
  timecoin: number
  /** Пропустить шаблонный shortcut → полная AI-генерация. */
  forceAi: boolean
  /** Обойти кеш готовых результатов → свежая генерация с нуля. */
  bypassCache: boolean
  /** Тратит бесплатную дневную квоту тарифа (true только у quick). */
  countsAgainstQuota: boolean
}

export const GENERATION_DEPTHS: Record<GenerationDepth, GenerationDepthConfig> = {
  quick: {
    id: "quick",
    label: "Быстрая",
    description: "Шаблон-первая генерация. Экономно, в рамках дневной квоты тарифа.",
    credits: 0,
    timecoin: 0,
    forceAi: false,
    bypassCache: false,
    countsAgainstQuota: true,
  },
  standard: {
    id: "standard",
    label: "Стандартная",
    description: "Полная AI-генерация приложения с нуля, без шаблонного упрощения.",
    /* Kept as the durable make-good value. Generation admission itself is
       charged in TimeCoin; this field prices the platform-funded retry. */
    credits: 20,
    timecoin: 1,
    forceAi: true,
    bypassCache: false,
    countsAgainstQuota: false,
  },
  deep: {
    id: "deep",
    label: "Глубокая",
    description: "Свежая AI-генерация без кеша — максимум деталей и уникальности.",
    /* Deep failures receive the larger platform-funded retry allowance. */
    credits: 50,
    timecoin: 2,
    forceAi: true,
    bypassCache: true,
    countsAgainstQuota: false,
  },
}

/** Приводит произвольный ввод к валидной глубине (по умолчанию quick). */
export function resolveDepth(value: unknown): GenerationDepth {
  return value === "standard" || value === "deep" ? value : "quick"
}

/** Публичный каталог глубин для фронтенда (без внутренних флагов реализации). */
export function serializeDepths() {
  return (Object.values(GENERATION_DEPTHS) as GenerationDepthConfig[]).map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    credits: d.credits,
    timecoin: d.timecoin,
    countsAgainstQuota: d.countsAgainstQuota,
  }))
}
