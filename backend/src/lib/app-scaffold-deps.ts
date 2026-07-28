import crypto from "node:crypto"

/* ================================================================
   OSGARD · Зависимости каркаса сгенерированного приложения
   ----------------------------------------------------------------
   ЕДИНЫЙ источник правды для двух вещей, которые обязаны совпадать,
   но раньше жили в двух разных местах и молча расходились:

   1. `package.json`, который генератор кладёт в приложение
      (services/app-generator.ts::staticTemplateFiles).
   2. `node_modules`, предустановленные в образе песочницы
      (docker/sandbox-next.Dockerfile) — тот самый «кэш сборок»,
      благодаря которому `next build` идёт БЕЗ СЕТИ за секунды
      вместо многоминутного `npm install`.

   Почему это важно (реальная поломка, а не гипотеза): в каркас был
   добавлен `lucide-react` — модели тянут иконки практически в каждом
   приложении. В Dockerfile его никто не добавил. Итог: почти любая
   сборка в быстром образе падала «module not found», платформа
   молча уходила на медленный путь с реальным `npm install` (под этим
   Docker Desktop — минуты), и кэш переставал существовать de facto,
   продолжая существовать de jure. Ни один тест этого не видел.

   Теперь набор объявлен ЗДЕСЬ, оба потребителя читают его отсюда, а
   `scaffoldDepsFingerprint()` даёт короткий отпечаток набора:
   - образ помечается им при сборке (LABEL),
   - песочница сверяет отпечаток ПЕРЕД использованием образа и не
     тратит минуты на заведомо провальную попытку (см.
     services/sandbox.service.ts::isPrebakedImageAvailable),
   - тест падает, если Dockerfile в репозитории отстал от набора.
   ================================================================ */

/** Рантайм-зависимости каркаса. Меняешь тут — пересобери образ песочницы. */
export const SCAFFOLD_DEPENDENCIES: Readonly<Record<string, string>> = {
  next: "^14.2.0",
  react: "^18.3.0",
  "react-dom": "^18.3.0",
  /* Иконки. Модели тянут lucide-react практически в каждом приложении (это
     фактический стандарт для Next+Tailwind), а пакета в каркасе не было —
     каждый такой импорт становился ошибкой сборки "dependency-missing".
     Дешевле и честнее объявить его в каркасе, чем заставлять модель рисовать
     иконки инлайновым SVG: приложение получается лучше, а класс ошибок
     исчезает целиком. */
  "lucide-react": "^0.454.0",
}

/** Сборочные зависимости каркаса (без них `next build` не проходит вообще). */
export const SCAFFOLD_DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
  typescript: "^5.7.0",
  tailwindcss: "^3.4.0",
  postcss: "^8.4.0",
  autoprefixer: "^10.4.0",
  "@types/node": "^22.0.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
}

/** Метка образа песочницы, в которой хранится отпечаток набора. */
export const SCAFFOLD_FINGERPRINT_LABEL = "osgard.scaffold.deps"

/** Путь до производного Dockerfile относительно каталога `backend/`. */
export const DOCKERFILE_PATH = "docker/sandbox-next.Dockerfile"

/**
 * Короткий стабильный отпечаток набора зависимостей. Стабильный — значит не
 * зависит от порядка ключей: набор сравнивается как множество пар имя→версия,
 * а не как текст файла (перестановка строк в объекте не должна «устаревать»
 * готовый образ).
 */
export function scaffoldDepsFingerprint(): string {
  const canonical = JSON.stringify([
    Object.entries(SCAFFOLD_DEPENDENCIES).sort(([a], [b]) => a.localeCompare(b)),
    Object.entries(SCAFFOLD_DEV_DEPENDENCIES).sort(([a], [b]) => a.localeCompare(b)),
  ])
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16)
}

/**
 * `package.json`, который ставится в образе песочницы. Это НЕ package.json
 * приложения (там своё имя/скрипты) — только набор зависимостей, ровно тот же.
 */
export function sandboxBasePackageJson(): string {
  return JSON.stringify(
    {
      name: "osgard-sandbox-base",
      version: "0.1.0",
      private: true,
      dependencies: SCAFFOLD_DEPENDENCIES,
      devDependencies: SCAFFOLD_DEV_DEPENDENCIES,
    },
    null,
    2,
  )
}

/**
 * Dockerfile образа песочницы, выведенный из набора выше. Файл в репозитории
 * (`docker/sandbox-next.Dockerfile`) — производный артефакт: его пишет
 * `scripts/build-sandbox-image.ts`, а тест сверяет, что он не отстал.
 */
export function renderSandboxDockerfile(): string {
  const fingerprint = scaffoldDepsFingerprint()

  /* package.json печатаем внутрь образа одной строкой: Dockerfile остаётся
     самодостаточным (контекст сборки не нужен), а сам JSON выведен из объявления
     выше, а не переписан руками с экранированием — именно ручная копия и
     разъехалась в прошлый раз. Одинарных кавычек в именах и диапазонах версий
     npm быть не может, но проверяем явно: тихо сломанный Dockerfile хуже отказа. */
  const pkg = JSON.stringify(JSON.parse(sandboxBasePackageJson()))
  if (pkg.includes("'")) {
    throw new Error("[app-scaffold-deps] кавычка в имени/версии пакета ломает генерацию Dockerfile")
  }

  return `# ================================================================
# OSGARD · Преднастроенный образ песочницы для Next.js static-export
# ----------------------------------------------------------------
# ФАЙЛ СГЕНЕРИРОВАН. Не править руками — источник набора зависимостей:
#   backend/src/lib/app-scaffold-deps.ts
# Пересборка образа (из каталога backend/):
#   npm run sandbox:image
#
# Зависимости каркаса ставятся ОДИН РАЗ на этапе сборки образа. Дальше
# сборка сгенерированного проекта = только \`next build\` поверх готовых
# node_modules: быстро и БЕЗ СЕТИ (--network none), т.к. качать нечего.
#
# Отпечаток набора: ${fingerprint}
# Песочница сверяет его с LABEL образа и не использует устаревший образ
# (иначе каждая сборка впустую тратит минуты и падает "module not found").
# ================================================================
FROM node:20-slim

WORKDIR /app

LABEL ${SCAFFOLD_FINGERPRINT_LABEL}="${fingerprint}"

# Ровно тот же набор, что генератор кладёт в package.json приложения.
RUN printf '%s' '${pkg}' > package.json \\
  && npm install --no-audit --no-fund \\
  && npm cache clean --force

# Прогреваем SWC-бинарь Next.js, чтобы первый next build не подтягивал его в рантайме.
ENV NEXT_TELEMETRY_DISABLED=1
`
}
