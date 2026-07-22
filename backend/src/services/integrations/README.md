# Интеграционные адаптеры (`backend/src/services/integrations/`)

Деплой, публикация в GitHub и встраивание Stripe/Supabase/Docker в
сгенерированные пользователем приложения. Все функции — чистые
TypeScript-адаптеры с ретраями (`withRetry`) и логированием
(`logIntegrationEvent`), без зависимости от Prisma/ORM (в проекте её нет —
персистентность на `better-sqlite3` + сырой SQL).

Общий тип файлового дерева (`backend/src/types/file-tree.ts`):

```ts
export type FileTreeEntry = { path: string; content: string }
export type FileTree = FileTreeEntry[]
```

## `deployToVercel(files, projectName, options?)`

Деплоит `FileTree` как production-деплой на Vercel через REST API (без CLI)
и возвращает публичный URL. Результат кешируется по хешу содержимого files
(`cache.service.ts` — Redis при наличии `REDIS_URL`, иначе in-memory), поэтому
повторный вызов с тем же набором файлов не создаёт новый деплой.

- **Сигнатура:** `(files: FileTree, projectName: string, options?: { force?: boolean; cacheTtlSeconds?: number }) => Promise<string>`
- **Env:** `VERCEL_TOKEN` (обязателен), `VERCEL_TEAM_ID` (опционален, если токен привязан к команде)
- **Возврат:** `"https://<project>-<hash>.vercel.app"`
- **Пример:**
  ```ts
  const url = await deployToVercel(files, "my-generated-app")
  const forced = await deployToVercel(files, "my-generated-app", { force: true })
  ```

## `createGitHubRepo(files, name, octokit?)`

Создаёт репозиторий под сервисным аккаунтом и пушит `files` одним коммитом
через Git Data API (blob → tree → commit → update ref) — атомарно, без
лишних запросов на файл. Blob'ы создаются пачками по 20 штук
(`BLOB_CHUNK_SIZE`), чтобы не упереться во вторичный rate-limit GitHub на
проектах с большим числом файлов.

- **Сигнатура:** `(files: FileTree, name: string, octokit?: Octokit) => Promise<string>`
- **Env:** `GITHUB_TOKEN` — Personal Access Token с правом `repo` (НЕ путать с `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, которые используются для OAuth соц-логина пользователей)
- **Возврат:** `"https://github.com/<owner>/<name>"`
- **Пример:**
  ```ts
  const repoUrl = await createGitHubRepo(files, "my-generated-app")
  ```
- Параметр `octokit` — для тестов (можно передать застабленный клиент); по умолчанию создаётся из `GITHUB_TOKEN`.

## `generateDockerfile(projectInfo)` / `generateDockerCompose(projectInfo)`

Чистая генерация (без сети/ФС) `Dockerfile` и `docker-compose.yml` под
конкретный стек. Multi-stage сборка для `nextjs`/`node`, статика и `react`
(Vite/CRA-подобная сборка) — через `nginx`, `python` — `pip install` без
сборочного стейджа.

- **Сигнатура:** `(projectInfo: ProjectInfo) => string`
- **`ProjectInfo`:**
  ```ts
  type ProjectInfo = {
    name: string
    framework?: "nextjs" | "node" | "static" | "react" | "python"
    nodeVersion?: string      // по умолчанию "20"
    pythonVersion?: string    // по умолчанию "3.12", только для framework: "python"
    port?: number             // по умолчанию 3000
    installCommand?: string   // по умолчанию "npm ci"
    buildCommand?: string     // по умолчанию "npm run build"
    startCommand?: string     // по умолчанию "npm run start"
  }
  ```
- **Env:** нет — чистая функция
- **Пример:**
  ```ts
  const dockerfile = generateDockerfile({ name: "my-app", framework: "nextjs" })
  const compose = generateDockerCompose({ name: "my-app", port: 3000 })
  ```

## `createStripeIntegration(options)`

Кодогенерация Stripe Checkout — **не вызывает Stripe API**, не создаёт
реальные Product/Price. Возвращает файлы для встраивания внутрь
сгенерированного Next.js-приложения (отдельно от биллинга самой платформы
OSGARD, см. `backend/src/lib/stripe.ts`).

- **Сигнатура:** `(options: StripeIntegrationOptions) => FileTree`
- **`StripeIntegrationOptions`:** `{ productName: string; priceUsd: number; mode?: "payment" | "subscription"; successPath?: string; cancelPath?: string }`
- **Env (в сгенерированном приложении, не в OSGARD):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`
- **Возврат:** `FileTree` — `lib/stripe.ts`, `app/api/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `components/CheckoutButton.tsx`, `.env.local.example`
- **Пример:**
  ```ts
  const files = createStripeIntegration({ productName: "Pro Plan", priceUsd: 19 })
  ```

## `setupSupabase(options?)`

Кодогенерация Supabase-клиента — **не вызывает Supabase Management API**,
не создаёт реальный проект. Пользователь сам создаёт проект на
supabase.com и вставляет ключи в `.env.local` по инструкции из
сгенерированного `.env.local.example`.

- **Сигнатура:** `(options?: SupabaseSetupOptions) => FileTree`
- **`SupabaseSetupOptions`:** `{ tables?: { name: string; columns: { name: string; type: string; constraints?: string }[] }[] }`
- **Env (в сгенерированном приложении):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Возврат:** `FileTree` — `lib/supabase/client.ts`, `lib/supabase/server.ts`, `.env.local.example`, и `supabase/migrations/0001_init.sql`, если передан `tables`
- **Пример:**
  ```ts
  const files = setupSupabase({ tables: [{ name: "todos", columns: [{ name: "title", type: "text" }] }] })
  ```

## `validateProjectFiles(files, stack)`

Чистая проверка файлового дерева перед деплоем — ловит очевидно неполные
проекты до похода к Vercel/GitHub, а не после. Бросает `Error` с
человекочитаемым описанием первой найденной проблемы.

- **Сигнатура:** `(files: FileTree, stack: ProjectStack) => void`
- **`ProjectStack`:** `"next" | "react" | "node" | "static"`
- **Проверки:** обязательные файлы по стеку (`package.json` + `next.config.mjs`/`index.html` в зависимости от стека), валидный JSON в `package.json`, наличие скрипта `build` для `stack: "next"`
- **Пример:**
  ```ts
  validateProjectFiles(files, "next") // бросает Error, если чего-то не хватает
  ```

## `logIntegrationEvent(platform, success, durationMs, error?)`

Лёгкое структурированное логирование деплоев/публикаций. Успех — в
`console.log`; ошибка — в `console.error` + `captureError` (Sentry,
`backend/src/lib/sentry.ts`). Без отдельной БД-таблицы/ORM — в проекте нет
Prisma, только `better-sqlite3` с сырыми SQL-миграциями.

- **Сигнатура:** `(platform: "vercel" | "github", success: boolean, durationMs: number, error?: unknown) => void`
- Используется внутри `deployToVercel` и `createGitHubRepo`; вызывать вручную обычно не нужно.

## `runInWebContainer(files)` — фронтенд, `lib/integrations/webcontainer.ts`

WebContainer работает только в браузере (WASM + `SharedArrayBuffer`),
поэтому живёт отдельно от бэкенд-адаптеров, во фронтенд-проекте
(`lib/integrations/`), а не здесь.

- **Сигнатура:** `(files: FileTree) => Promise<string>` (`FileTree` — дублирующий тип в `lib/integrations/file-tree.ts`, т.к. фронтенд и бэкенд — раздельные TS-проекты)
- **Требование окружения:** страница, на которой запускается WebContainer, должна отдавать заголовки `Cross-Origin-Opener-Policy: same-origin` и `Cross-Origin-Embedder-Policy: require-corp`
- **Возврат:** URL превью-сервера (`server-ready` событие WebContainer)
- Тестами `node:test` не покрыт — требует браузерного рантайма, см. раздел «Тесты» ниже.

## Тесты

`backend/src/tests/integrations/*.test.ts`, запускаются встроенным
`node:test` (см. `backend/package.json` → `"test"`), без сети:
`vercel.test.ts` мокает `global.fetch`, `github.test.ts` использует
инъектируемый параметр `octokit` с застабленными методами, остальные —
детерминированные чистые функции. `webcontainer.ts` (фронтенд,
браузер-only) в этот набор не входит.
