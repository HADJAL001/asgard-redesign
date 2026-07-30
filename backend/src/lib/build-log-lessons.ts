/* ================================================================
   OSGARD · Уроки из лога настоящей сборки
   ----------------------------------------------------------------
   Статический разбор (lib/build-integrity) знает ровно то, чему его
   научили. Компилятор знает больше — и когда он говорит «нет» там, где
   разбор сказал «да», это самый ценный сигнал, какой платформа вообще
   может получить: доказанная дыра в её собственном представлении о
   правильном коде. До волны 7 этот сигнал выбрасывался — ветки падения
   реальной сборки не писали в память ни строчки.

   Модуль намеренно ЧИСТЫЙ: ни БД, ни сети, только текст лога на входе и
   правила на выходе. Ключи правил совпадают с ключами статического
   разбора там, где класс дефекта тот же, — иначе память платформы
   разделилась бы надвое и один и тот же урок копился бы в двух счётчиках.

   Каждая сигнатура ниже взята из НАСТОЯЩЕГО вывода `next build` версии
   каркаса (Next 14.2, см. lib/app-scaffold-deps), а не написана по памяти:
   стенд `scripts/measure-build-lessons.ts` собирает битые приложения
   по-настоящему и кормит парсер тем, что напечатал компилятор.

   ПОЧЕМУ НЕТ ПРАВИЛА «сборка упала». Урок обязан быть действием, которое
   модель может выполнить в следующей генерации. «Не ломай сборку» —
   не урок, а упрёк: он занял бы слот в промпте и не изменил бы ни строки
   кода. Незнакомый лог честно даёт ноль уроков, и замер это показывает.
   ================================================================ */

export type BuildLessonRule = {
  rule: string
  /** Что должно найтись в логе. Регулярка — потому что лог многострочный и шумный. */
  signature: RegExp
  /** Уточнение: правило применимо, только если функция вернула true. */
  refine?: (log: string) => boolean
}

/* Лог приходит С ЦВЕТОМ: Next раскрашивает вывод даже без терминала, и путь в
   «Can't resolve '…'» физически выглядит как "\x1b[32m./components/header\x1b[39m".
   Первая версия парсера сравнивала первый символ пути с "." и не срабатывала
   никогда — ровно тот случай, когда проверка молча ничего не проверяет. */
const ANSI = /\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "")
}

/** Путь из «Can't resolve '…'»: свой файл проекта или сторонний пакет. */
const RESOLVE_TARGET = /Can't resolve '([^']+)'/g

function resolveTargets(log: string): string[] {
  return [...log.matchAll(RESOLVE_TARGET)].map((m) => m[1].trim())
}

function hasOwnFileTarget(log: string): boolean {
  return resolveTargets(log).some((t) => t.startsWith(".") || t.startsWith("/") || t.startsWith("@/"))
}

function hasPackageTarget(log: string): boolean {
  return resolveTargets(log).some((t) => !t.startsWith(".") && !t.startsWith("/") && !t.startsWith("@/"))
}

/* Порядок значения не имеет: срабатывают все подходящие правила, потому что одна
   сборка честно может нарушать два запрета сразу. */
export const BUILD_LOG_RULES: BuildLessonRule[] = [
  {
    /* «You're importing a component that needs useState. This React hook only works
       in a Client Component…» — самый частый провал статического экспорта. */
    rule: "use-client-missing",
    signature: /needs?\s+`?(useState|useEffect|useRef|useContext|useReducer|createContext|useLayoutEffect)`?[\s\S]{0,120}?(client component|"use client")/i,
  },
  {
    rule: "use-client-missing",
    signature: /mark the file \(or its parent\) with the "use client" directive/i,
  },
  {
    rule: "import-missing",
    signature: /Module not found: Can't resolve/i,
    refine: hasOwnFileTarget,
  },
  {
    rule: "dependency-missing",
    signature: /Module not found: Can't resolve/i,
    refine: hasPackageTarget,
  },
  {
    /* Пререндер падает на браузерном API: код обращается к нему на верхнем уровне
       модуля, а не внутри эффекта. */
    rule: "browser-global-toplevel",
    signature: /ReferenceError:\s*(window|document|localStorage|sessionStorage|navigator)\s+is not defined/i,
  },
  {
    rule: "suspense-boundary-missing",
    signature: /(useSearchParams\(\)|usePathname\(\)|useRouter\(\))[\s\S]{0,80}?suspense boundary|missing-suspense-with-csr-bailout/i,
  },
  {
    rule: "dynamic-route-unexportable",
    signature: /missing "generateStaticParams\(\)"|generateStaticParams\(\)" so it cannot be used with "output: export"/i,
  },
  {
    rule: "client-metadata-conflict",
    signature: /attempting to export "?metadata"?[\s\S]{0,80}?"use client"/i,
  },
  {
    /* Настоящий текст Next 14 на незакрытом теге: «x Unexpected token `div`.
       Expected jsx identifier». Ни «Syntax error», ни «Parsing … failed» в нём нет —
       выдуманная по памяти сигнатура не сработала бы никогда. */
    rule: "syntax",
    signature:
      /Parsing ecmascript source code failed|Syntax error:|Unexpected eof|Unterminated |Unexpected token[^\n]{0,60}Expected |Expected jsx identifier/i,
  },
  {
    rule: "async-client-component",
    signature: /async\/await is not yet supported in Client Components|"?use client"?[\s\S]{0,80}?async (function|component)/i,
  },
  {
    rule: "server-function-prop",
    signature: /Functions cannot be passed directly to Client Components/i,
  },
]

/* Правило последней очереди: страницу компилятор назвать сумел, а причину мы не
   опознали. Оно ДЕЙСТВИЕ, а не упрёк: «страница обязана отрисовываться на сервере
   без браузерного окружения и без падений на пустых данных». Даётся только когда
   конкретной причины не нашлось — иначе один провал раздувал бы счётчики двумя
   уроками, и `suspense-boundary-missing` вечно ходил бы в паре с ним. */
const PRERENDER_FALLBACK: BuildLessonRule = {
  rule: "prerender-failed",
  signature: /Error occurred prerendering page|Export encountered errors/i,
}

export type BuildLogLesson = { rule: string; count: number }

/**
 * Правила, которым научил провал настоящей сборки. Пустой массив — честный ответ
 * «в этом логе платформа не узнала ничего»: лучше ноль, чем правило-упрёк.
 */
export function lessonsFromBuildLog(rawLog: string): BuildLogLesson[] {
  if (!rawLog || !rawLog.trim()) return []
  const log = stripAnsi(rawLog)

  const counts = new Map<string, number>()
  for (const rule of BUILD_LOG_RULES) {
    if (!rule.signature.test(log)) continue
    if (rule.refine && !rule.refine(log)) continue
    counts.set(rule.rule, (counts.get(rule.rule) ?? 0) + 1)
  }

  if (counts.size === 0 && PRERENDER_FALLBACK.signature.test(log)) {
    counts.set(PRERENDER_FALLBACK.rule, 1)
  }

  /* Одно правило может сработать двумя сигнатурами (у Next два разных текста про
     "use client") — это по-прежнему ОДИН урок, а не два. */
  return [...counts.keys()].map((rule) => ({ rule, count: 1 }))
}
