/* ================================================================
   OSGARD · Дизайн-система генерируемых приложений
   ----------------------------------------------------------------
   Почему этот модуль вообще появился.

   Раньше `app-generator.ts` отдавал сгенерированному приложению
   `tailwind.config.ts` с `theme: { extend: {} }` (буквально пустым) и
   `globals.css` из трёх строк `@tailwind`. То есть у приложения НЕ БЫЛО
   дизайн-системы вообще: ни токенов, ни шрифта, ни шкалы, ни тёмной
   темы, ни движения. Модели не на что было опереться — каждый файл
   изобретал цвета заново (`bg-slate-950` в одном, `bg-zinc-900` в
   другом, `bg-[#0f172a]` в третьем). Именно это, а не «слабая модель»,
   делало результат визуально дешёвым и несогласованным.

   Здесь дизайн-система выводится ДЕТЕРМИНИРОВАННО из самого замысла
   (тема → архетип, стабильный хеш → оттенок/вариация), поэтому она есть
   ВСЕГДА — даже когда ни один AI-провайдер не сконфигурирован. AI-арт-
   директор (app-generator.ts) может лишь ПРЕДЛОЖИТЬ вариацию внутри
   безопасного пространства: любой его ответ проходит через
   `clampBriefProposal`, а контрастность доводится алгоритмически
   (`ensureContrast`), а не принимается на веру.

   Тот же приём «стабильный хеш → узнаваемое лицо», что уже дал лицо
   артефактам в lib/artifact-identity.ts (#67): одинаковый замысел даёт
   одинаковый облик, разные — разный.
   ================================================================ */

/** Версия схемы брифа. Входит в ключ кеша генерации: иначе после
 *  изменения дизайн-системы кеш продолжил бы отдавать старый облик. */
export const DESIGN_BRIEF_VERSION = 2

export type DesignPalette = {
  /** Фон страницы. */
  canvas: string
  /** Основная поверхность (карточки, панели). */
  surface: string
  /** Вторичная поверхность (вложенные плашки, полосатые строки). */
  surfaceAlt: string
  /** Разделители и рамки. */
  border: string
  /** Основной текст. Гарантированно ≥ TEXT_CONTRAST_MIN к canvas. */
  ink: string
  /** Приглушённый текст. Гарантированно ≥ MUTED_CONTRAST_MIN к canvas. */
  muted: string
  /** Основной акцент (CTA). */
  primary: string
  /** Текст НА основном акценте. Гарантированно контрастен к primary. */
  primaryInk: string
  /** Дополнительный акцент (подсветки, ссылки, графики). */
  accent: string
  /** Текст на дополнительном акценте. */
  accentInk: string
  success: string
  warning: string
  danger: string
}

export type DesignTypography = {
  /** Семейство заголовков (Google Fonts, подключается <link>, см. renderLayout). */
  display: string
  /** Семейство основного текста. */
  body: string
  /** Моноширинное семейство (код, числа). */
  mono: string
  /** Множитель модульной шкалы (1.2 — плотная, 1.333 — выразительная). */
  scale: number
  /** Базовый кегль в px. */
  base: number
}

export type DesignMotion = {
  fast: string
  base: string
  slow: string
  ease: string
}

/** Стиль эффекта контейнеров/секций (карточки, панели) — независимая от цвета
 *  ось темизации: «из чего сделаны» поверхности, а не «какого они оттенка».
 *  glass — эталонное стекло (текущее поведение, blur+прозрачность);
 *  neon — яркая обводка и внешнее свечение вместо блюра;
 *  matte — плоские поверхности без blur, тонкая тень;
 *  aurora — анимированный градиентный бордер;
 *  crystal — усиленный blur + зерно + резкие светлые грани. */
export type DesignEffectStyle = "glass" | "neon" | "matte" | "aurora" | "crystal"

export type DesignBrief = {
  version: number
  /** Архетип продукта — определяет весь характер (см. ARCHETYPES). */
  archetype: DesignArchetypeId
  /** Человекочитаемое настроение — идёт в промпт как творческая рамка. */
  mood: string
  /** Светлая или тёмная схема. */
  scheme: "light" | "dark"
  palette: DesignPalette
  typography: DesignTypography
  /** Базовый шаг сетки в px (4 или 8) — ритм отступов. */
  spacingBase: number
  radius: { sm: number; md: number; lg: number; pill: number }
  elevation: { sm: string; md: string; lg: string }
  motion: DesignMotion
  /** Стиль эффекта поверхностей — см. DesignEffectStyle. */
  effect: DesignEffectStyle
  density: "compact" | "comfortable" | "spacious"
  /** Паттерны раскладки — попадают в промпт манифеста как архитектурная рамка. */
  layout: string[]
  /** Тон микрокопии — чтобы тексты в интерфейсе звучали одинаково. */
  voice: string
  /** Фактически измеренные контрасты (не обещания, а замер). */
  contrast: { inkOnCanvas: number; mutedOnCanvas: number; primaryInkOnPrimary: number; inkOnSurface: number }
}

/* ----------------------------------------------------------------
   Цветовая математика (WCAG 2.1). Всё чистое и тестируемое.
   ---------------------------------------------------------------- */

/** Минимальный контраст основного текста (WCAG AA для обычного текста). */
export const TEXT_CONTRAST_MIN = 4.5
/** Минимальный контраст приглушённого текста и UI-элементов (WCAG AA для крупного/нетекстового). */
export const MUTED_CONTRAST_MIN = 3

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** HSL → HEX. h в градусах [0,360), s и l в [0,1]. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const lig = clamp(l, 0, 1)

  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lig - c / 2

  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** HEX → HSL. Нужен, чтобы двигать светлоту существующего цвета при доводке контраста. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return { h: 0, s: 0, l }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60

  return { h, s, l }
}

/** Относительная яркость по WCAG 2.1 (sRGB → линейное пространство). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** Контраст двух цветов по WCAG: от 1 (одинаковые) до 21 (чёрный/белый). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Доводит цвет `fg` до требуемого контраста с `bg`, двигая ТОЛЬКО светлоту и
 * сохраняя оттенок (то есть характер палитры не теряется). Двигаем в ту сторону,
 * где фон оставляет запас: тёмный фон → осветляем текст, светлый → затемняем.
 *
 * Это ключевая гарантия модуля: какой бы оттенок ни выбрал хеш или AI-арт-директор,
 * читаемость обеспечена алгоритмом, а не надеждой. Если требуемый контраст
 * недостижим даже на пределе — возвращаем лучший достигнутый (чистый белый/чёрный),
 * что всегда даёт максимум возможного.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrastRatio(fg, bg) >= min) return fg

  const { h, s } = hexToHsl(fg)
  const bgIsDark = relativeLuminance(bg) < 0.5
  const steps = 100

  let best = fg
  let bestRatio = contrastRatio(fg, bg)

  for (let i = 1; i <= steps; i++) {
    // Идём от текущей светлоты к пределу (1 для тёмного фона, 0 для светлого).
    const target = bgIsDark ? i / steps : 1 - i / steps
    const candidate = hslToHex(h, s, target)
    const ratio = contrastRatio(candidate, bg)
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = candidate
    }
    if (ratio >= min) return candidate
  }

  return best
}

/** Стабильный 32-битный хеш (FNV-1a) — тот же приём, что в lib/proof-of-craft.ts.
 *  Одинаковый замысел → одинаковый облик, разный → разный. */
export function stableHash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Детерминированный генератор чисел из хеша: последовательные независимые «броски». */
function makeRoller(seed: string) {
  let state = stableHash(seed) || 1
  return {
    /** Следующее число в [0,1). */
    next(): number {
      state ^= state << 13
      state >>>= 0
      state ^= state >>> 17
      state ^= state << 5
      state >>>= 0
      return state / 0x100000000
    },
    /** Следующий элемент массива. */
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(this.next() * items.length) % items.length]
    },
    /** Следующее целое в [min,max]. */
    int(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1))
    },
  }
}

/* ----------------------------------------------------------------
   Архетипы: характер продукта, а не просто «набор цветов».
   Тема из detectTheme (services/template-store.ts) → архетип.
   ---------------------------------------------------------------- */

export type DesignArchetypeId =
  | "arcane" // фэнтези/магия — глубина, свечение, ритуал
  | "console" // sci-fi/киберпанк — приборная панель, точность
  | "boutique" // e-commerce — витрина, товар в главной роли
  | "editorial" // блог/новости — типографика правит бал
  | "cockpit" // дашборд/аналитика — плотность данных
  | "playful" // игры — энергия, крупные акценты
  | "commons" // соцсети/сообщество — тёплое, человечное
  | "gallery" // портфолио/лендинг — воздух и один сильный акцент
  | "studio" // general — универсальный современный продукт

type ArchetypeSpec = {
  id: DesignArchetypeId
  /** Диапазон базового оттенка в градусах (может пересекать 360). */
  hue: [number, number]
  scheme: "light" | "dark"
  /** Насыщенность акцента. */
  saturation: [number, number]
  density: DesignBrief["density"]
  spacingBase: number
  radiusScale: number
  effect: DesignEffectStyle
  moods: readonly string[]
  voices: readonly string[]
  layouts: readonly string[]
  fonts: ReadonlyArray<{ display: string; body: string }>
  /** Сдвиг дополнительного акцента относительно основного, в градусах. */
  accentShift: readonly number[]
}

/** Шрифты подключаются <link>-тегом на Google Fonts (см. renderLayout), а НЕ через
 *  next/font/google: `next build` в песочнице идёт с `--network none`, и next/font
 *  скачивает файлы на этапе сборки → сборка упала бы. С <link> сборка офлайн-безопасна,
 *  шрифт подтягивает браузер в рантайме, а CSS-стек даёт достойный фоллбэк. */
/* Фоллбэк-стеки нужны в ДВУХ формах, и путать их нельзя:
   • CSS — одна строка значения `font-family` (globals.css);
   • JS  — массив отдельных строк для tailwind.config.ts. Если подставить
     туда CSS-форму, получатся голые идентификаторы (`ui-sans-serif, system-ui`)
     вместо строковых литералов → синтаксическая ошибка и падение `next build`. */
const SANS_STACK = ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"]
const SERIF_STACK = ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"]
const MONO_STACK = ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"]

/** CSS-форма: значение font-family одной строкой (многословные имена в кавычках). */
function cssStack(stack: string[]): string {
  return stack.map((f) => (f.includes(" ") ? `"${f}"` : f)).join(", ")
}

/** JS-форма: элементы массива Tailwind-конфига — КАЖДЫЙ строковым литералом. */
function jsStack(family: string, stack: string[]): string {
  return `[${[family, ...stack].map((f) => JSON.stringify(f)).join(", ")}]`
}

const SANS_FALLBACK = cssStack(SANS_STACK)
const SERIF_FALLBACK = cssStack(SERIF_STACK)
const MONO_FALLBACK = cssStack(MONO_STACK)

/** Семейства, для которых знаем, что это засечный шрифт (влияет на CSS-фоллбэк). */
const SERIF_FAMILIES = new Set(["Playfair Display", "Lora", "Source Serif 4", "Fraunces"])

const ARCHETYPES: Record<DesignArchetypeId, ArchetypeSpec> = {
  arcane: {
    id: "arcane",
    hue: [255, 300],
    scheme: "dark",
    saturation: [0.55, 0.75],
    density: "comfortable",
    spacingBase: 8,
    radiusScale: 1.2,
    effect: "aurora",
    moods: ["древняя магия и тёплое золото", "ночной ритуал, свет из глубины", "рукопись, ожившая в цифре"],
    voices: ["торжественный, но без пафоса — короткие фразы с весом"],
    layouts: [
      "герой во весь экран с глубоким градиентом и одним сильным CTA",
      "карточки-«свитки» в сетке 1/2/3 колонки по брейкпоинтам",
      "боковая панель навигации на десктопе, нижняя лента на мобильном",
    ],
    fonts: [
      { display: "Cinzel", body: "Inter" },
      { display: "Playfair Display", body: "Inter" },
      { display: "Sora", body: "Manrope" },
    ],
    accentShift: [40, -35, 150],
  },
  console: {
    id: "console",
    hue: [175, 215],
    scheme: "dark",
    saturation: [0.6, 0.85],
    density: "compact",
    spacingBase: 4,
    radiusScale: 0.6,
    effect: "neon",
    moods: ["холодная точность приборной панели", "неон на графите", "инженерная ясность"],
    voices: ["сжатый технический тон, факты и числа без украшений"],
    layouts: [
      "сетка модулей-виджетов с чёткими рамками",
      "верхняя строка состояния с живыми индикаторами",
      "моноширинные числовые блоки, выровненные по правому краю",
    ],
    fonts: [
      { display: "Space Grotesk", body: "IBM Plex Sans" },
      { display: "Chakra Petch", body: "Inter" },
      { display: "Sora", body: "Inter" },
    ],
    accentShift: [160, -60, 90],
  },
  boutique: {
    id: "boutique",
    hue: [15, 45],
    scheme: "light",
    saturation: [0.4, 0.65],
    density: "spacious",
    spacingBase: 8,
    radiusScale: 1,
    effect: "matte",
    moods: ["тёплая витрина, товар в главной роли", "спокойный премиум без крика", "бумага, свет и один акцент"],
    voices: ["дружелюбно и конкретно: что это, сколько стоит, что дальше"],
    layouts: [
      "сетка товаров 2/3/4 колонки с крупными изображениями",
      "липкая панель фильтров сбоку на десктопе, шторка на мобильном",
      "карточка товара: изображение, цена, один основной CTA",
    ],
    fonts: [
      { display: "Fraunces", body: "Inter" },
      { display: "Playfair Display", body: "Manrope" },
      { display: "Sora", body: "Inter" },
    ],
    accentShift: [180, 140, -40],
  },
  editorial: {
    id: "editorial",
    hue: [0, 30],
    scheme: "light",
    saturation: [0.35, 0.6],
    density: "spacious",
    spacingBase: 8,
    radiusScale: 0.5,
    effect: "matte",
    moods: ["типографика правит бал", "тихая бумага и крупные заголовки", "журнальный разворот"],
    voices: ["повествовательный, полные предложения, уважение к читателю"],
    layouts: [
      "колонка текста шириной 65–75 символов, крупная типографика",
      "лента статей с датой, тегом и превью",
      "оглавление сбоку на широких экранах",
    ],
    fonts: [
      { display: "Playfair Display", body: "Source Serif 4" },
      { display: "Fraunces", body: "Inter" },
      { display: "Lora", body: "Inter" },
    ],
    accentShift: [200, 150, -30],
  },
  cockpit: {
    id: "cockpit",
    hue: [200, 250],
    scheme: "dark",
    saturation: [0.5, 0.75],
    density: "compact",
    spacingBase: 4,
    radiusScale: 0.7,
    effect: "neon",
    moods: ["плотность данных без шума", "спокойная синева и точные линии", "рабочая панель профессионала"],
    voices: ["нейтральный аналитический тон, метрика и единица измерения рядом"],
    layouts: [
      "сетка KPI-плиток сверху, детальные таблицы ниже",
      "боковая навигация с разделами на десктопе, свёрнутая на мобильном",
      "таблицы с липкой шапкой и горизонтальной прокруткой на узких экранах",
    ],
    fonts: [
      { display: "Inter", body: "Inter" },
      { display: "IBM Plex Sans", body: "IBM Plex Sans" },
      { display: "Manrope", body: "Inter" },
    ],
    accentShift: [140, -80, 60],
  },
  playful: {
    id: "playful",
    hue: [280, 340],
    scheme: "dark",
    saturation: [0.7, 0.9],
    density: "comfortable",
    spacingBase: 8,
    radiusScale: 1.6,
    effect: "neon",
    moods: ["энергия аркады", "яркий акцент на тёмном поле", "скорость и азарт"],
    voices: ["живой и короткий, глаголы в повелительном наклонении"],
    layouts: [
      "крупные интерактивные карточки с заметным hover-состоянием",
      "верхняя панель со счётом/прогрессом",
      "нижняя панель действий на мобильном, зона большого пальца",
    ],
    fonts: [
      { display: "Space Grotesk", body: "Manrope" },
      { display: "Chakra Petch", body: "Inter" },
      { display: "Sora", body: "Inter" },
    ],
    accentShift: [120, -100, 60],
  },
  commons: {
    id: "commons",
    hue: [140, 200],
    scheme: "light",
    saturation: [0.45, 0.7],
    density: "comfortable",
    spacingBase: 8,
    radiusScale: 1.4,
    effect: "glass",
    moods: ["тёплое человечное сообщество", "мягкие формы и воздух", "разговор, а не интерфейс"],
    voices: ["тёплый разговорный тон на «вы», без канцелярита"],
    layouts: [
      "лента карточек одной колонкой на мобильном, двумя на десктопе",
      "аватар + имя + время в шапке каждой записи",
      "поле ввода закреплено снизу на мобильном",
    ],
    fonts: [
      { display: "Manrope", body: "Inter" },
      { display: "Sora", body: "Inter" },
      { display: "Nunito", body: "Inter" },
    ],
    accentShift: [-60, 150, 80],
  },
  gallery: {
    id: "gallery",
    hue: [210, 260],
    scheme: "light",
    saturation: [0.3, 0.55],
    density: "spacious",
    spacingBase: 8,
    radiusScale: 0.8,
    effect: "crystal",
    moods: ["воздух и один сильный акцент", "галерейная тишина", "минимум элементов, максимум веса"],
    voices: ["уверенный минимализм: одно предложение на мысль"],
    layouts: [
      "герой с крупным именем и одной строкой позиционирования",
      "сетка работ с раскрытием в модальное окно",
      "секции, разделённые крупными вертикальными отступами",
    ],
    fonts: [
      { display: "Sora", body: "Inter" },
      { display: "Playfair Display", body: "Inter" },
      { display: "Space Grotesk", body: "Manrope" },
    ],
    accentShift: [180, -120, 90],
  },
  studio: {
    id: "studio",
    hue: [215, 265],
    scheme: "dark",
    saturation: [0.5, 0.7],
    density: "comfortable",
    spacingBase: 8,
    radiusScale: 1,
    effect: "glass",
    moods: ["современный продукт без лишнего", "спокойная глубина и ясная иерархия", "инструмент, которому доверяешь"],
    voices: ["ясный продуктовый тон: польза, действие, результат"],
    layouts: [
      "шапка с логотипом и основным действием справа",
      "секции с заголовком, подзаголовком и карточками",
      "адаптив: одна колонка на мобильном, сетка от md",
    ],
    fonts: [
      { display: "Sora", body: "Inter" },
      { display: "Space Grotesk", body: "Inter" },
      { display: "Manrope", body: "Inter" },
    ],
    accentShift: [150, -70, 60],
  },
}

/** Тема из detectTheme → архетип. Неизвестная тема → универсальный studio. */
const THEME_TO_ARCHETYPE: Record<string, DesignArchetypeId> = {
  fantasy: "arcane",
  scifi: "console",
  ecommerce: "boutique",
  blog: "editorial",
  dashboard: "cockpit",
  game: "playful",
  social: "commons",
  portfolio: "gallery",
  general: "studio",
}

export function archetypeForTheme(theme: string | undefined): DesignArchetypeId {
  return THEME_TO_ARCHETYPE[(theme || "general").toLowerCase()] ?? "studio"
}

/* ----------------------------------------------------------------
   Вывод брифа
   ---------------------------------------------------------------- */

function buildPalette(spec: ArchetypeSpec, hue: number, sat: number, accentHue: number): DesignPalette {
  const dark = spec.scheme === "dark"

  // Нейтрали берут лёгкий налёт основного оттенка — палитра читается как одна семья,
  // а не «цветной акцент поверх серого».
  const neutralSat = dark ? 0.18 : 0.12

  const canvas = dark ? hslToHex(hue, neutralSat, 0.06) : hslToHex(hue, neutralSat * 0.5, 0.985)
  const surface = dark ? hslToHex(hue, neutralSat, 0.11) : hslToHex(hue, neutralSat * 0.4, 1)
  const surfaceAlt = dark ? hslToHex(hue, neutralSat, 0.16) : hslToHex(hue, neutralSat * 0.5, 0.955)
  const border = dark ? hslToHex(hue, neutralSat, 0.24) : hslToHex(hue, neutralSat * 0.6, 0.87)

  const primary = hslToHex(hue, sat, dark ? 0.62 : 0.46)
  const accent = hslToHex(accentHue, clamp(sat + 0.05, 0, 1), dark ? 0.66 : 0.48)

  // Текст: стартуем от «правильного» тона и ДОВОДИМ до контраста алгоритмом.
  const inkSeed = dark ? hslToHex(hue, 0.12, 0.95) : hslToHex(hue, 0.25, 0.13)
  const mutedSeed = dark ? hslToHex(hue, 0.14, 0.68) : hslToHex(hue, 0.18, 0.42)

  const ink = ensureContrast(inkSeed, canvas, TEXT_CONTRAST_MIN)
  const muted = ensureContrast(mutedSeed, canvas, MUTED_CONTRAST_MIN)

  // Текст на акценте: пробуем оба полюса и берём тот, что контрастнее — так CTA
  // остаётся читаемым и на светлом, и на тёмном акценте.
  const primaryInk = ensureContrast(
    contrastRatio("#ffffff", primary) >= contrastRatio("#000000", primary) ? "#ffffff" : "#0b0b0f",
    primary,
    TEXT_CONTRAST_MIN,
  )
  const accentInk = ensureContrast(
    contrastRatio("#ffffff", accent) >= contrastRatio("#000000", accent) ? "#ffffff" : "#0b0b0f",
    accent,
    TEXT_CONTRAST_MIN,
  )

  // Семантические цвета держат канонический оттенок, но подстраивают светлоту под схему.
  const success = ensureContrast(hslToHex(148, 0.6, dark ? 0.55 : 0.34), canvas, MUTED_CONTRAST_MIN)
  const warning = ensureContrast(hslToHex(38, 0.85, dark ? 0.6 : 0.38), canvas, MUTED_CONTRAST_MIN)
  const danger = ensureContrast(hslToHex(2, 0.7, dark ? 0.62 : 0.44), canvas, MUTED_CONTRAST_MIN)

  return { canvas, surface, surfaceAlt, border, ink, muted, primary, primaryInk, accent, accentInk, success, warning, danger }
}

export type DeriveBriefInput = {
  name: string
  hint?: string
  /** Тема из detectTheme (services/template-store.ts). Необязательна — модуль остаётся чистым. */
  theme?: string
  keywords?: string[]
}

/**
 * Детерминированно выводит дизайн-систему из замысла приложения.
 * Одинаковый вход → байт-в-байт одинаковый бриф (важно и для тестов, и для того,
 * чтобы повторная генерация того же проекта не «прыгала» в облике).
 *
 * Работает БЕЗ AI и без сети — это базовый уровень качества, ниже которого
 * платформа не опускается никогда.
 */
export function deriveDesignBrief(input: DeriveBriefInput): DesignBrief {
  const archetypeId = archetypeForTheme(input.theme)
  const spec = ARCHETYPES[archetypeId]

  const seed = `${archetypeId}|${input.name.trim().toLowerCase()}|${(input.hint || "").trim().toLowerCase()}|${(input.keywords || []).slice().sort().join(",")}`
  const roll = makeRoller(seed)

  const [hueMin, hueMax] = spec.hue
  const hue = (hueMin + roll.next() * (hueMax - hueMin) + 360) % 360
  const [satMin, satMax] = spec.saturation
  const sat = satMin + roll.next() * (satMax - satMin)
  const accentHue = (hue + roll.pick(spec.accentShift) + 360) % 360

  const palette = buildPalette(spec, hue, sat, accentHue)
  const fontPair = roll.pick(spec.fonts)
  const scale = roll.pick([1.2, 1.25, 1.333] as const)

  const r = spec.radiusScale
  const radius = {
    sm: Math.round(4 * r),
    md: Math.round(10 * r),
    lg: Math.round(18 * r),
    pill: 999,
  }

  // Тени окрашены основным оттенком: тень «из той же вселенной», а не серая клякса.
  const shadowRgb = hexToRgb(hslToHex(hue, 0.5, spec.scheme === "dark" ? 0.03 : 0.35))!
  const shade = (y: number, blur: number, alpha: number) =>
    `0 ${y}px ${blur}px rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, ${alpha})`

  return {
    version: DESIGN_BRIEF_VERSION,
    archetype: archetypeId,
    mood: roll.pick(spec.moods),
    scheme: spec.scheme,
    palette,
    typography: {
      display: fontPair.display,
      body: fontPair.body,
      mono: "JetBrains Mono",
      scale,
      base: spec.density === "compact" ? 15 : 16,
    },
    spacingBase: spec.spacingBase,
    radius,
    elevation: {
      sm: shade(1, 2, 0.16),
      md: shade(6, 16, 0.22),
      lg: shade(18, 42, 0.28),
    },
    motion: {
      fast: "120ms",
      base: "220ms",
      slow: "420ms",
      ease: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
    effect: spec.effect,
    density: spec.density,
    layout: [...spec.layouts],
    voice: roll.pick(spec.voices),
    contrast: {
      inkOnCanvas: Number(contrastRatio(palette.ink, palette.canvas).toFixed(2)),
      mutedOnCanvas: Number(contrastRatio(palette.muted, palette.canvas).toFixed(2)),
      primaryInkOnPrimary: Number(contrastRatio(palette.primaryInk, palette.primary).toFixed(2)),
      inkOnSurface: Number(contrastRatio(palette.ink, palette.surface).toFixed(2)),
    },
  }
}

/* ----------------------------------------------------------------
   Зажим предложения AI-арт-директора
   ---------------------------------------------------------------- */

/** Что модели РАЗРЕШЕНО предложить. Всё остальное игнорируется. */
export type BriefProposal = {
  archetype?: string
  mood?: string
  scheme?: string
  hue?: number
  accentHue?: number
  saturation?: number
  density?: string
  radiusStyle?: string
  displayFont?: string
  bodyFont?: string
  voice?: string
  layout?: unknown
  effect?: string
}

const EFFECT_STYLES = ["glass", "neon", "matte", "aurora", "crystal"] as const

/** Публичный список стилей эффектов — уходит в промпт арт-директора и в /design/options. */
export const EFFECT_MENU: readonly DesignEffectStyle[] = EFFECT_STYLES

const ALLOWED_DISPLAY_FONTS = new Set<string>()
const ALLOWED_BODY_FONTS = new Set<string>()
for (const spec of Object.values(ARCHETYPES)) {
  for (const pair of spec.fonts) {
    ALLOWED_DISPLAY_FONTS.add(pair.display)
    ALLOWED_BODY_FONTS.add(pair.body)
  }
}

/** Публичный список шрифтов — уходит в промпт арт-директора как закрытое меню. */
export const FONT_MENU = {
  display: [...ALLOWED_DISPLAY_FONTS].sort(),
  body: [...ALLOWED_BODY_FONTS].sort(),
}

export const ARCHETYPE_MENU = Object.keys(ARCHETYPES) as DesignArchetypeId[]

/**
 * Накладывает предложение AI на детерминированный бриф, ЖЁСТКО зажимая всё,
 * что модель может испортить.
 *
 * Принцип: AI выбирает ВНУТРИ безопасного пространства, а не задаёт его.
 * Сырые hex от модели не принимаются вовсе (только оттенок числом) — иначе
 * вернулась бы ровно та беда, ради которой модуль и написан. Контраст всегда
 * пересчитывается алгоритмом, поэтому даже враждебный ответ не может выдать
 * нечитаемый интерфейс.
 */
export function clampBriefProposal(base: DesignBrief, proposal: BriefProposal | null | undefined): DesignBrief {
  if (!proposal || typeof proposal !== "object") return base

  const archetypeId: DesignArchetypeId =
    typeof proposal.archetype === "string" && (ARCHETYPES as Record<string, ArchetypeSpec>)[proposal.archetype]
      ? (proposal.archetype as DesignArchetypeId)
      : base.archetype
  const spec = ARCHETYPES[archetypeId]

  const scheme: "light" | "dark" =
    proposal.scheme === "light" || proposal.scheme === "dark" ? proposal.scheme : spec.scheme
  // Схема влияет на всю светлоту палитры — пересобираем спеку с выбранной схемой.
  const effectiveSpec: ArchetypeSpec = { ...spec, scheme }

  const hue =
    typeof proposal.hue === "number" && Number.isFinite(proposal.hue)
      ? ((proposal.hue % 360) + 360) % 360
      : hexToHsl(base.palette.primary).h

  const accentHue =
    typeof proposal.accentHue === "number" && Number.isFinite(proposal.accentHue)
      ? ((proposal.accentHue % 360) + 360) % 360
      : (hue + spec.accentShift[0] + 360) % 360

  // Насыщенность зажата в коридор архетипа: модель не может выдать ни серую кашу,
  // ни кислотную заливку.
  const saturation =
    typeof proposal.saturation === "number" && Number.isFinite(proposal.saturation)
      ? clamp(proposal.saturation, spec.saturation[0], spec.saturation[1])
      : (spec.saturation[0] + spec.saturation[1]) / 2

  const density: DesignBrief["density"] =
    proposal.density === "compact" || proposal.density === "comfortable" || proposal.density === "spacious"
      ? proposal.density
      : base.density

  const effect: DesignEffectStyle =
    typeof proposal.effect === "string" && (EFFECT_STYLES as readonly string[]).includes(proposal.effect)
      ? (proposal.effect as DesignEffectStyle)
      : base.effect

  const display =
    typeof proposal.displayFont === "string" && ALLOWED_DISPLAY_FONTS.has(proposal.displayFont)
      ? proposal.displayFont
      : base.typography.display
  const body =
    typeof proposal.bodyFont === "string" && ALLOWED_BODY_FONTS.has(proposal.bodyFont)
      ? proposal.bodyFont
      : base.typography.body

  const radiusScale =
    proposal.radiusStyle === "sharp"
      ? 0.35
      : proposal.radiusStyle === "soft"
        ? 1.5
        : proposal.radiusStyle === "pill"
          ? 2.2
          : spec.radiusScale

  const palette = buildPalette(effectiveSpec, hue, saturation, accentHue)

  const layout =
    Array.isArray(proposal.layout) && proposal.layout.length > 0
      ? proposal.layout
          .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
          .slice(0, 6)
          .map((l) => l.trim().slice(0, 200))
      : base.layout

  const shadowRgb = hexToRgb(hslToHex(hue, 0.5, scheme === "dark" ? 0.03 : 0.35))!
  const shade = (y: number, blur: number, alpha: number) =>
    `0 ${y}px ${blur}px rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, ${alpha})`

  const sanitizeText = (value: unknown, fallback: string, maxLen: number): string => {
    if (typeof value !== "string") return fallback
    // Схлопываем переводы строк: текст уходит обратно в промпт, а многострочный
    // ответ модели — классический вектор инъекции в инструкции.
    const cleaned = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
    return cleaned.length > 0 ? cleaned.slice(0, maxLen) : fallback
  }

  return {
    ...base,
    archetype: archetypeId,
    scheme,
    mood: sanitizeText(proposal.mood, base.mood, 120),
    voice: sanitizeText(proposal.voice, base.voice, 160),
    palette,
    typography: { ...base.typography, display, body },
    effect,
    density,
    spacingBase: density === "compact" ? 4 : 8,
    radius: {
      sm: Math.round(4 * radiusScale),
      md: Math.round(10 * radiusScale),
      lg: Math.round(18 * radiusScale),
      pill: 999,
    },
    elevation: { sm: shade(1, 2, 0.16), md: shade(6, 16, 0.22), lg: shade(18, 42, 0.28) },
    layout: layout.length > 0 ? layout : base.layout,
    contrast: {
      inkOnCanvas: Number(contrastRatio(palette.ink, palette.canvas).toFixed(2)),
      mutedOnCanvas: Number(contrastRatio(palette.muted, palette.canvas).toFixed(2)),
      primaryInkOnPrimary: Number(contrastRatio(palette.primaryInk, palette.primary).toFixed(2)),
      inkOnSurface: Number(contrastRatio(palette.ink, palette.surface).toFixed(2)),
    },
  }
}

/* ----------------------------------------------------------------
   Рендер файлов дизайн-системы в генерируемое приложение
   ---------------------------------------------------------------- */

/** Строковый литерал TS из произвольного текста. `JSON.stringify` сам ставит кавычки
 *  и экранирует ВСЁ, включая обратные слэши — ручное `.replace(/"/g, '\\"')` их
 *  пропускало, и имя, оканчивающееся на `\`, ломало бы TSX (js/incomplete-sanitization). */
function tsStringLiteral(value: string, maxLen: number): string {
  return JSON.stringify(value.replace(/[\r\n]+/g, " ").slice(0, maxLen))
}

/** Текст, безопасный для вставки внутрь блочного комментария JS/CSS.
 *  `mood` приходит в том числе от AI-арт-директора: последовательность `*​/`
 *  закрыла бы комментарий досрочно и порвала сгенерированный файл. */
function safeComment(value: string): string {
  return value.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ")
}

/** Модульная шкала кеглей от базового размера. */
function typeScale(base: number, ratio: number): Record<string, string> {
  const step = (n: number) => `${(base * Math.pow(ratio, n)) / 16}rem`
  return {
    xs: `${(base / Math.pow(ratio, 1.5)) / 16}rem`,
    sm: step(-1),
    base: step(0),
    lg: step(1),
    xl: step(2),
    "2xl": step(3),
    "3xl": step(4),
    "4xl": step(5),
    "5xl": step(6),
  }
}

/**
 * `tailwind.config.ts` с РЕАЛЬНЫМИ токенами вместо `theme: { extend: {} }`.
 * Цвета кладём литеральными hex (а не `var(--…)`): так работают модификаторы
 * прозрачности Tailwind (`bg-surface/60`), которые ломаются на CSS-переменных
 * без синтаксиса `<alpha-value>`. CSS-переменные тоже отдаём — для ручного CSS.
 */
export function renderTailwindConfig(brief: DesignBrief): string {
  const p = brief.palette
  const scale = typeScale(brief.typography.base, brief.typography.scale)
  const sb = brief.spacingBase

  const fontFamily = (family: string, serif: boolean) => jsStack(family, serif ? SERIF_STACK : SANS_STACK)

  return `import type { Config } from "tailwindcss"

/* Дизайн-система приложения. Сгенерирована OSGARD: архетип «${brief.archetype}»,
   настроение — ${safeComment(brief.mood)}. Контраст основного текста к фону: ${brief.contrast.inkOnCanvas}:1
   (WCAG AA требует 4.5:1). Правь осознанно: цвета связаны с app/globals.css. */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "${p.canvas}",
        surface: { DEFAULT: "${p.surface}", alt: "${p.surfaceAlt}" },
        border: "${p.border}",
        ink: { DEFAULT: "${p.ink}", muted: "${p.muted}" },
        primary: { DEFAULT: "${p.primary}", ink: "${p.primaryInk}" },
        accent: { DEFAULT: "${p.accent}", ink: "${p.accentInk}" },
        success: "${p.success}",
        warning: "${p.warning}",
        danger: "${p.danger}",
      },
      fontFamily: {
        display: ${fontFamily(brief.typography.display, SERIF_FAMILIES.has(brief.typography.display))},
        body: ${fontFamily(brief.typography.body, SERIF_FAMILIES.has(brief.typography.body))},
        mono: ${jsStack(brief.typography.mono, MONO_STACK)},
      },
      fontSize: {
${Object.entries(scale)
  .map(([k, v]) => `        "${k}": "${v}",`)
  .join("\n")}
      },
      borderRadius: {
        ds: "${brief.radius.md}px",
        "ds-sm": "${brief.radius.sm}px",
        "ds-lg": "${brief.radius.lg}px",
        "ds-pill": "${brief.radius.pill}px",
      },
      spacing: {
        ds: "${sb}px",
        "ds-2": "${sb * 2}px",
        "ds-3": "${sb * 3}px",
        "ds-4": "${sb * 4}px",
        "ds-6": "${sb * 6}px",
        "ds-8": "${sb * 8}px",
      },
      boxShadow: {
        ds: "${brief.elevation.md}",
        "ds-sm": "${brief.elevation.sm}",
        "ds-lg": "${brief.elevation.lg}",
      },
      transitionTimingFunction: { ds: "${brief.motion.ease}" },
      transitionDuration: { ds: "${brief.motion.base.replace("ms", "")}" },
      maxWidth: { prose: "68ch" },
    },
  },
  plugins: [],
}

export default config
`
}

/** Google-Fonts URL для <link>. Офлайн-безопасно на этапе сборки (см. комментарий выше). */
export function googleFontsHref(brief: DesignBrief): string {
  const families = [brief.typography.display, brief.typography.body, brief.typography.mono]
  const unique = [...new Set(families)]
  const params = unique.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&")
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

/** Зерно для эффекта crystal — тот же приём, что и .premium-card в платформе
 *  OSGARD (SVG fractalNoise через data URI), только для генерируемых проектов
 *  собственная копия: это отдельный `globals.css`, у него нет доступа к
 *  переменным платформы. */
const EFFECT_GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/** CSS custom properties, специфичные для выбранного стиля эффекта поверхностей.
 *  Цвета свечения/обводки берутся из палитры — эффект остаётся «из той же
 *  вселенной», что и остальной интерфейс, а не наложенным поверх шаблоном. */
function effectTokens(brief: DesignBrief): string {
  const p = brief.palette
  const accentRgb = hexToRgb(p.accent) ?? { r: 255, g: 255, b: 255 }
  const primaryRgb = hexToRgb(p.primary) ?? { r: 255, g: 255, b: 255 }
  const inkRgb = hexToRgb(p.ink) ?? { r: 255, g: 255, b: 255 }

  switch (brief.effect) {
    case "neon":
      return `  --ds-effect-blur: 0px;
  --ds-effect-glow: 0 0 1px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.6), 0 0 28px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.35);
  --ds-effect-border: 1.5px solid rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.7);
  --ds-effect-noise-opacity: 0;`
    case "matte":
      return `  --ds-effect-blur: 0px;
  --ds-effect-glow: none;
  --ds-effect-border: 1px solid var(--ds-border);
  --ds-effect-noise-opacity: 0;`
    case "aurora":
      return `  --ds-effect-blur: 6px;
  --ds-effect-glow: 0 0 32px rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25);
  --ds-effect-border: 1px solid transparent;
  --ds-effect-noise-opacity: 0;`
    case "crystal":
      return `  --ds-effect-blur: 26px;
  --ds-effect-glow: 0 0 20px rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, 0.08);
  --ds-effect-border: 1px solid rgba(255, 255, 255, 0.16);
  --ds-effect-noise-opacity: 0.05;`
    case "glass":
    default:
      return `  --ds-effect-blur: 16px;
  --ds-effect-glow: none;
  --ds-effect-border: 1px solid var(--ds-border);
  --ds-effect-noise-opacity: 0;`
  }
}

/** `.ds-card` дорабатывается под выбранный эффект: обычные свойства (фон/радиус)
 *  остаются в базовом правиле, здесь — только то, что отличает материал.
 *  aurora и crystal используют псевдоэлементы (обычные CSS-свойства не тянут
 *  анимированную градиентную рамку или отдельный слой зерна поверх контента). */
function effectCardCss(brief: DesignBrief): string {
  switch (brief.effect) {
    case "neon":
      return `  .ds-card {
    backdrop-filter: none;
    border: var(--ds-effect-border);
    box-shadow: var(--ds-shadow), var(--ds-effect-glow);
  }`
    case "matte":
      return `  .ds-card {
    backdrop-filter: none;
    border: var(--ds-effect-border);
    box-shadow: var(--ds-shadow);
  }`
    case "aurora":
      return `  .ds-card {
    position: relative;
    backdrop-filter: blur(var(--ds-effect-blur));
    border: var(--ds-effect-border);
    box-shadow: var(--ds-shadow), var(--ds-effect-glow);
    isolation: isolate;
  }
  .ds-card::before {
    content: "";
    position: absolute;
    inset: 0;
    padding: 1.5px;
    border-radius: inherit;
    background: conic-gradient(from var(--ds-aurora-angle, 0deg), var(--ds-primary), var(--ds-accent), var(--ds-primary));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    animation: ds-aurora-spin 6s linear infinite;
    pointer-events: none;
    z-index: -1;
  }
  @keyframes ds-aurora-spin {
    to { --ds-aurora-angle: 360deg; }
  }
  @property --ds-aurora-angle {
    syntax: "<angle>";
    initial-value: 0deg;
    inherits: false;
  }`
    case "crystal":
      return `  .ds-card {
    position: relative;
    backdrop-filter: blur(var(--ds-effect-blur)) saturate(1.15);
    border: var(--ds-effect-border);
    box-shadow: var(--ds-shadow), var(--ds-effect-glow);
    overflow: hidden;
  }
  .ds-card::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: ${EFFECT_GRAIN_SVG};
    background-size: 120px 120px;
    opacity: var(--ds-effect-noise-opacity);
    mix-blend-mode: overlay;
    pointer-events: none;
  }`
    case "glass":
    default:
      return `  .ds-card {
    backdrop-filter: blur(var(--ds-effect-blur)) saturate(1.1);
    border: var(--ds-effect-border);
    box-shadow: var(--ds-shadow);
  }`
  }
}

/**
 * `app/globals.css` с базовым слоем вместо трёх голых `@tailwind`-директив:
 * CSS-переменные токенов, типографический ритм, видимый фокус для клавиатуры,
 * уважение к `prefers-reduced-motion`, аккуратная прокрутка и выделение.
 */
export function renderGlobalsCss(brief: DesignBrief): string {
  const p = brief.palette
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Токены дизайн-системы (для ручного CSS; Tailwind-утилиты берут те же значения
   из tailwind.config.ts). Архетип «${brief.archetype}» · ${safeComment(brief.mood)} */
:root {
  --ds-canvas: ${p.canvas};
  --ds-surface: ${p.surface};
  --ds-surface-alt: ${p.surfaceAlt};
  --ds-border: ${p.border};
  --ds-ink: ${p.ink};
  --ds-ink-muted: ${p.muted};
  --ds-primary: ${p.primary};
  --ds-primary-ink: ${p.primaryInk};
  --ds-accent: ${p.accent};
  --ds-accent-ink: ${p.accentInk};
  --ds-success: ${p.success};
  --ds-warning: ${p.warning};
  --ds-danger: ${p.danger};

  --ds-radius: ${brief.radius.md}px;
  --ds-space: ${brief.spacingBase}px;
  --ds-shadow: ${brief.elevation.md};
  --ds-motion: ${brief.motion.base};
  --ds-ease: ${brief.motion.ease};

${effectTokens(brief)}

  color-scheme: ${brief.scheme};
}

@layer base {
  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
  }

  body {
    background-color: var(--ds-canvas);
    color: var(--ds-ink);
    font-family: "${brief.typography.body}", ${SERIF_FAMILIES.has(brief.typography.body) ? SERIF_FALLBACK : SANS_FALLBACK};
    font-size: ${brief.typography.base}px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  h1, h2, h3, h4 {
    font-family: "${brief.typography.display}", ${SERIF_FAMILIES.has(brief.typography.display) ? SERIF_FALLBACK : SANS_FALLBACK};
    line-height: 1.15;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  p {
    text-wrap: pretty;
  }

  code, pre {
    font-family: "${brief.typography.mono}", ${MONO_FALLBACK};
  }

  /* Видимый фокус для клавиатуры — без него интерфейс недоступен, а не «чище». */
  :focus-visible {
    outline: 2px solid var(--ds-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  ::selection {
    background: var(--ds-primary);
    color: var(--ds-primary-ink);
  }

  /* Уважаем системную настройку: анимация не должна вызывать дурноту. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@layer components {
  /* Готовые примитивы — чтобы страницы собирались из одной материи,
     а не из случайных наборов утилит. */
  .ds-card {
    background-color: var(--ds-surface);
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-radius);
    box-shadow: var(--ds-shadow);
  }

  /* Материал поверхности — эффект «${brief.effect}», зависит от выбора пользователя
     в дизайн-студии (POST /design/projects/:id/retune). Переопределяет часть
     свойств .ds-card выше: порядок в каскаде имеет значение. */
${effectCardCss(brief)}

  .ds-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: calc(var(--ds-space) * 1);
    padding: calc(var(--ds-space) * 1.5) calc(var(--ds-space) * 3);
    border-radius: var(--ds-radius);
    font-weight: 600;
    transition: transform var(--ds-motion) var(--ds-ease), opacity var(--ds-motion) var(--ds-ease);
  }

  .ds-btn:hover {
    transform: translateY(-1px);
  }

  .ds-btn-primary {
    background-color: var(--ds-primary);
    color: var(--ds-primary-ink);
  }

  .ds-btn-ghost {
    background-color: transparent;
    color: var(--ds-ink);
    border: 1px solid var(--ds-border);
  }

  .ds-container {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: calc(var(--ds-space) * 3);
  }
}
`
}

/** `app/layout.tsx` — со шрифтом, фоном и языком вместо голого `<html><body>`. */
export function renderLayout(brief: DesignBrief, name: string, description: string): string {
  const safeName = tsStringLiteral(name, 200)
  const safeDescription = tsStringLiteral(description || `${name} — приложение, созданное в OSGARD.`, 300)

  return `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: ${safeName},
  description: ${safeDescription},
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="${googleFontsHref(brief)}" />
      </head>
      <body className="bg-canvas text-ink font-body antialiased">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border bg-surface">
            <nav aria-label="Документы и поддержка" className="ds-container flex flex-wrap items-center gap-x-ds-3 gap-y-ds-1 py-ds-3 text-sm text-ink-muted">
              <a href="/privacy" className="hover:text-ink focus-visible:text-ink">Политика конфиденциальности</a>
              <a href="/terms" className="hover:text-ink focus-visible:text-ink">Условия использования</a>
              <a href="/pricing" className="hover:text-ink focus-visible:text-ink">Тарифы</a>
              <a href="/support" className="hover:text-ink focus-visible:text-ink">Поддержка</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  )
}
`
}

/** Legal-ready pages are platform-owned so an AI response cannot omit or replace
 * disclosure routes needed before a product accepts users or payments. */
export function renderLegalReadyFiles(name: string): Array<{ path: string; content: string }> {
  const safeName = tsStringLiteral(name.trim() || "Продукт", 200)
  const shell = (title: string, lead: string, body: string) => `const productName = ${safeName}

export default function Page() {
  return (
    <main className="bg-canvas text-ink">
      <article className="ds-container max-w-3xl py-ds-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-muted">Информация для пользователей</p>
        <h1 className="mt-ds-2 font-display text-4xl sm:text-5xl">${title}</h1>
        <p className="mt-ds-3 text-lg text-ink-muted">${lead}</p>
        <div className="mt-ds-6 space-y-ds-4 leading-7 text-ink">
${body}
        </div>
        <p className="mt-ds-6 border-t border-border pt-ds-3 text-sm text-ink-muted">Перед публикацией владелец ${"{productName}"} обязан проверить этот шаблон, указать фактические данные оператора и актуальные контакты.</p>
      </article>
    </main>
  )
}
`

  return [
    {
      path: "app/privacy/page.tsx",
      content: shell("Политика конфиденциальности", "Как продукт обрабатывает данные пользователей.",
        '          <section><h2 className="font-display text-2xl">Какие данные могут обрабатываться</h2><p className="mt-ds-1">{productName} обрабатывает только данные, необходимые для работы выбранных функций: сведения, которые пользователь вводит сам, и технические данные для безопасности и стабильности сервиса.</p></section>\n          <section><h2 className="font-display text-2xl">Цели и контроль</h2><p className="mt-ds-1">Данные используются для предоставления сервиса, поддержки, защиты от злоупотреблений и исполнения обязательств. Владелец продукта обязан описать подключённые сервисы, сроки хранения и порядок отзыва согласия до запуска.</p></section>\n          <section><h2 className="font-display text-2xl">Вопросы о данных</h2><p className="mt-ds-1">Для запроса доступа, исправления или удаления данных используйте канал поддержки, опубликованный на странице «Поддержка».</p></section>'),
    },
    {
      path: "app/terms/page.tsx",
      content: shell("Условия использования", "Правила доступа к продукту и ответственности сторон.",
        '          <section><h2 className="font-display text-2xl">Использование сервиса</h2><p className="mt-ds-1">Пользователь использует {productName} законно, бережно и в пределах назначений продукта. Владелец продукта обязан опубликовать окончательную редакцию условий до открытия доступа для пользователей.</p></section>\n          <section><h2 className="font-display text-2xl">Доступ и изменения</h2><p className="mt-ds-1">Функции, ограничения и порядок уведомлений об изменениях должны быть описаны владельцем продукта понятным языком. Существенные изменения условий требуют публикации обновлённой редакции.</p></section>\n          <section><h2 className="font-display text-2xl">Контакты</h2><p className="mt-ds-1">Контакты оператора и порядок обращения по претензиям публикуются на странице «Поддержка».</p></section>'),
    },
    {
      path: "app/pricing/page.tsx",
      content: shell("Тарифы и оплата", "Актуальные условия должны быть понятны до оформления заказа.",
        '          <section><h2 className="font-display text-2xl">Текущие тарифы</h2><p className="mt-ds-1">Владелец продукта должен разместить здесь действующие тарифы, валюту, период оплаты, состав каждого плана, налоги и доступные способы оплаты. Пока эти данные не настроены, платные функции не должны предлагаться к покупке.</p></section>\n          <section><h2 className="font-display text-2xl">До оплаты</h2><p className="mt-ds-1">Перед подтверждением заказа пользователь должен видеть итоговую сумму, периодичность списаний, условия продления, возврата и отмены. Кнопка оплаты должна вести только в настроенный платёжный поток.</p></section>\n          <section><h2 className="font-display text-2xl">Вопросы по оплате</h2><p className="mt-ds-1">Для вопросов о счёте, возврате или отмене используйте опубликованный канал поддержки.</p></section>'),
    },
    {
      path: "app/support/page.tsx",
      content: shell("Поддержка", "Куда обратиться по вопросам о продукте, данных и оплате.",
        '          <section><h2 className="font-display text-2xl">Контакт владельца</h2><p className="mt-ds-1">До запуска замените этот текст на реальный канал связи: рабочий email, форму поддержки или иной проверяемый способ обращения. Не публикуйте вымышленные реквизиты или контакты.</p></section>\n          <section><h2 className="font-display text-2xl">Что указать в обращении</h2><p className="mt-ds-1">Опишите проблему, дату, используемую функцию и безопасный способ обратной связи. Не отправляйте пароли, коды подтверждения или платёжные данные в открытом виде.</p></section>\n          <section><h2 className="font-display text-2xl">Срок ответа</h2><p className="mt-ds-1">Владелец продукта должен указать фактический срок ответа и порядок обработки обращений до публикации продукта.</p></section>'),
    },
  ]
}

/** Фоллбэк-страница на случай, когда AI недоступен: даже она теперь на токенах. */
export function renderFallbackPage(brief: DesignBrief, name: string, hint?: string): string {
  const safeName = name.replace(/[{}`<>]/g, "").trim() || "Приложение"
  const safeHint = (hint || "").replace(/[{}`<>]/g, "").trim()

  return `export default function Page() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="ds-container flex min-h-screen flex-col items-center justify-center gap-ds-3 py-ds-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">${brief.archetype}</p>
        <h1 className="font-display text-4xl sm:text-5xl">${safeName}</h1>
        <p className="max-w-prose text-ink-muted">${safeHint || "Приложение создано в OSGARD."}</p>
        <a href="#start" className="ds-btn ds-btn-primary mt-ds-2">
          Начать
        </a>
      </div>
    </main>
  )
}
`
}

/** Пути файлов, которые ПОЛНОСТЬЮ принадлежат дизайн-системе. Их содержимое
 *  всегда перерисовывается из брифа — в том числе поверх файлов, пришедших из
 *  закэшированного шаблона (иначе старые проекты тянули бы пустой конфиг). */
export const DESIGN_SYSTEM_PATHS = ["tailwind.config.ts", "app/globals.css", "app/layout.tsx"] as const

/** Три файла дизайн-системы одним вызовом — единая точка для генератора и адаптера шаблонов. */
export function renderDesignSystemFiles(
  brief: DesignBrief,
  name: string,
  description: string,
): Array<{ path: string; content: string }> {
  return [
    { path: "tailwind.config.ts", content: renderTailwindConfig(brief) },
    { path: "app/globals.css", content: renderGlobalsCss(brief) },
    { path: "app/layout.tsx", content: renderLayout(brief, name, description) },
    ...renderLegalReadyFiles(name),
  ]
}

/** Компактный «контракт дизайна» для промптов генерации файлов.
 *  Именно он лечит главный дефект: раньше файлы генерировались параллельно и
 *  вслепую друг к другу, поэтому каждый изобретал свою палитру. */
export function renderDesignContract(brief: DesignBrief): string {
  return `=== ДИЗАЙН-КОНТРАКТ (обязателен, нарушения будут отклонены) ===
Архетип: ${brief.archetype}. Настроение: ${brief.mood}. Тон текстов: ${brief.voice}.
Схема: ${brief.scheme}. Плотность: ${brief.density}. Материал поверхностей: ${brief.effect}
(уже реализован внутри класса ds-card в CSS — используй ds-card как есть, ничего
дополнительно для эффекта дописывать не нужно).

Используй ТОЛЬКО эти токены Tailwind (они объявлены в tailwind.config.ts):
- Фон страницы: bg-canvas | Поверхности: bg-surface, bg-surface-alt
- Текст: text-ink (основной), text-ink-muted (вторичный)
- Рамки/разделители: border-border
- Основное действие: bg-primary text-primary-ink
- Акцент/ссылки/выделения: text-accent, bg-accent text-accent-ink
- Статусы: text-success, text-warning, text-danger
- Шрифты: font-display (заголовки), font-body (текст), font-mono (числа/код)
- Скругления: rounded-ds, rounded-ds-sm, rounded-ds-lg, rounded-ds-pill
- Тени: shadow-ds, shadow-ds-sm, shadow-ds-lg
- Отступы шага сетки: p-ds-2, gap-ds-3, py-ds-6 и т.п. (шаг ${brief.spacingBase}px)
- Готовые классы: ds-container, ds-card, ds-btn, ds-btn-primary, ds-btn-ghost

ЗАПРЕЩЕНО:
- Сырые цвета: bg-[#0f172a], text-[#fff], style={{ color: "#..." }}, rgb()/hsl() в JSX.
- Палитра Tailwind по умолчанию: slate/zinc/gray/neutral/stone/blue/indigo и подобные.
- Произвольные значения цвета в квадратных скобках.

ОБЯЗАТЕЛЬНО:
- Адаптив: мобильный макет по умолчанию, sm:/md:/lg: для широких экранов.
- Доступность: у <img> есть alt; у <button> есть type; интерактив — это <button>/<a>,
  а не <div onClick>; у <a> есть href; порядок заголовков h1 → h2 → h3 без пропусков.
- Состояния данных: если компонент показывает список/загрузку — предусмотри пустое
  состояние и состояние загрузки, не оставляй голый массив.
- Никакого «Lorem ipsum»: пиши осмысленные тексты по теме приложения на русском.

Раскладка, которой держится приложение:
${brief.layout.map((l) => `- ${l}`).join("\n")}
=== КОНЕЦ КОНТРАКТА ===`
}
