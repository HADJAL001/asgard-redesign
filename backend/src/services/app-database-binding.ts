import db from "../lib/db"
import { captureError } from "../lib/sentry"
import { encrypt, decrypt } from "../utils/encryption"
import { allowsServerCode, type AppProfile } from "../lib/app-profiles"
import {
  applyAppSchema,
  isAppDatabaseConfigured,
  provisionAppDatabase,
  dropAppDatabase,
  type AppDatabaseCredentials,
} from "./app-database.service"

/* ================================================================
   OSGARD · Связка «сгенерированное приложение ↔ его база»
   ----------------------------------------------------------------
   Провижининг (app-database.service) знает про Postgres и ничего не знает
   про проекты. Этот модуль — стык: он выдаёт базу конкретному проекту,
   применяет объявленные приложением таблицы и запоминает выданное.

   ПОЧЕМУ СТРОКА ПОДКЛЮЧЕНИЯ НЕ ПОПАДАЕТ В ФАЙЛЫ ПРИЛОЖЕНИЯ. Соблазн
   очевидный: записать готовый `.env.local` с паролем — и приложение
   заработает сразу. Но файлы проекта живут в `project_files`, уезжают в
   архив скачивания и в деплой, то есть пароль базы размножился бы по
   местам, которые для секретов не предназначены и не шифруются. Поэтому
   в файлы идёт `.env.local.example` с плейсхолдером, а настоящая строка
   лежит зашифрованной в `app_databases` и отдаётся владельцу отдельным
   защищённым запросом — ровно как это делают Supabase/Neon: креды
   показывают в панели, а не кладут в репозиторий.
   ================================================================ */

export type AppDatabaseBinding = {
  /** Файлы, которые надо добавить к набору приложения (пример env, инструкция). */
  extraFiles: Array<{ path: string; content: string }>
  /** Что произошло — для честного отчёта пользователю, без выдумывания успеха. */
  status: "provisioned" | "not-configured" | "failed" | "not-applicable"
  schema?: string
  schemaStatus?: "applied" | "failed" | "empty"
  error?: string
}

const ENV_EXAMPLE_PATH = ".env.local.example"
const APP_SCHEMA_PATH = "db/schema.sql"

function envExample(schema: string): string {
  return `# База данных этого приложения (PostgreSQL, выдана платформой OSGARD).
#
# Скопируй этот файл в .env.local и подставь строку подключения — её можно
# получить на странице проекта («База данных» → показать строку подключения).
# Она содержит пароль, поэтому в код и в репозиторий её вписывать нельзя.
#
# Схема этого приложения в кластере: ${schema}
# Приложение работает только со своей схемой: доступа к данным других
# приложений у его роли нет на уровне прав Postgres.

DATABASE_URL=postgresql://<роль>:<пароль>@<хост>:5432/<база>?options=-c%20search_path%3D${schema}
`
}

function dbReadme(schema: string, schemaStatus: "applied" | "failed" | "empty", error?: string): string {
  const applied =
    schemaStatus === "applied"
      ? "Таблицы из `schema.sql` уже созданы в базе — приложение можно запускать сразу после подстановки DATABASE_URL."
      : schemaStatus === "empty"
        ? "Приложение не объявило таблиц: файл `schema.sql` пуст или отсутствует. Добавь в него CREATE TABLE и примени вручную."
        : `Таблицы создать НЕ удалось: ${error ?? "ошибка применения schema.sql"}. Исправь \`schema.sql\` и примени его к базе вручную.`

  return `# База данных приложения

Схема в кластере: \`${schema}\`

${applied}

## Как это устроено

- Доступ к базе — только из серверного кода (API-роуты, серверные компоненты)
  через модуль \`lib/db.ts\`. В браузер строка подключения не попадает: у
  переменной \`DATABASE_URL\` намеренно нет префикса \`NEXT_PUBLIC_\`.
- У приложения своя роль Postgres с правами только на схему \`${schema}\`.
  Прочитать данные другого приложения этой ролью нельзя — запрещено правами
  базы, а не договорённостью.
- \`schema.sql\` должен быть идемпотентным (\`CREATE TABLE IF NOT EXISTS\`):
  платформа применяет его при каждой выдаче базы.
`
}

/**
 * Выдаёт проекту базу, применяет объявленные им таблицы и запоминает креды.
 *
 * Никогда не бросает: приложение без базы — хуже, чем приложение с базой, но
 * приложение, генерация которого упала из-за недоступного кластера, — хуже всего.
 * Все отказы возвращаются статусом и попадают в отчёт как есть.
 */
export async function bindAppDatabase(options: {
  projectId: number
  profile: AppProfile
  files: Array<{ path: string; content: string }>
}): Promise<AppDatabaseBinding> {
  const { projectId, profile, files } = options

  if (!allowsServerCode(profile)) return { extraFiles: [], status: "not-applicable" }

  if (!isAppDatabaseConfigured()) {
    /* Кластер не подключён — говорим об этом прямо, в файлы ничего не кладём.
       Молча положить пример env было бы обещанием базы, которой нет. */
    return {
      extraFiles: [],
      status: "not-configured",
      error: "кластер баз приложений не подключён (APPS_DATABASE_URL не задан)",
    }
  }

  const outcome = await provisionAppDatabase(projectId)
  if (!outcome.ok) {
    return { extraFiles: [], status: "failed", error: outcome.error }
  }

  const credentials = outcome.credentials
  const schemaSql = files.find((f) => f.path === APP_SCHEMA_PATH)?.content?.trim() ?? ""

  let schemaStatus: "applied" | "failed" | "empty" = schemaSql ? "applied" : "empty"
  let schemaError: string | undefined
  if (schemaSql) {
    const applied = await applyAppSchema(credentials, schemaSql)
    if (!applied.ok) {
      schemaStatus = "failed"
      schemaError = applied.error
    }
  }

  rememberCredentials(projectId, credentials, schemaStatus, schemaError)

  return {
    extraFiles: [
      { path: ENV_EXAMPLE_PATH, content: envExample(credentials.schema) },
      { path: "db/README.md", content: dbReadme(credentials.schema, schemaStatus, schemaError) },
    ],
    status: "provisioned",
    schema: credentials.schema,
    schemaStatus,
    error: schemaError,
  }
}

function rememberCredentials(
  projectId: number,
  credentials: AppDatabaseCredentials,
  schemaStatus: string,
  schemaError?: string,
): void {
  try {
    const now = Date.now()
    db.prepare(
      `INSERT INTO app_databases
         (project_id, schema_name, db_role, connection_string_encrypted, schema_status, schema_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         schema_name = excluded.schema_name,
         db_role = excluded.db_role,
         connection_string_encrypted = excluded.connection_string_encrypted,
         schema_status = excluded.schema_status,
         schema_error = excluded.schema_error,
         updated_at = excluded.updated_at`,
    ).run(
      projectId,
      credentials.schema,
      credentials.role,
      encrypt(credentials.connectionString),
      schemaStatus,
      schemaError ?? null,
      now,
      now,
    )
  } catch (err) {
    captureError(`[app-database] не удалось запомнить креды проекта ${projectId}:`, err)
  }
}

export type StoredAppDatabase = {
  schema: string
  role: string
  connectionString: string
  schemaStatus: string | null
  schemaError: string | null
  createdAt: number
}

/** Читает выданные креды (расшифровывая). null — базы у проекта нет. */
export function getAppDatabase(projectId: number): StoredAppDatabase | null {
  try {
    const row = db
      .prepare(
        `SELECT schema_name, db_role, connection_string_encrypted, schema_status, schema_error, created_at
           FROM app_databases WHERE project_id = ?`,
      )
      .get(projectId) as
      | {
          schema_name: string
          db_role: string
          connection_string_encrypted: string
          schema_status: string | null
          schema_error: string | null
          created_at: number
        }
      | undefined
    if (!row) return null

    return {
      schema: row.schema_name,
      role: row.db_role,
      connectionString: decrypt(row.connection_string_encrypted),
      schemaStatus: row.schema_status,
      schemaError: row.schema_error,
      createdAt: row.created_at,
    }
  } catch (err) {
    captureError(`[app-database] не удалось прочитать креды проекта ${projectId}:`, err)
    return null
  }
}

/**
 * Снос базы вместе с проектом. Без этого схема и роль с валидным паролем
 * остаются в кластере навсегда — сирота, которую никто не найдёт.
 *
 * ВЫЗЫВАТЬ ДО удаления строки проекта: у `app_databases.project_id` стоит
 * `ON DELETE CASCADE`, а foreign_keys в sqlite включены (lib/db.ts) — после
 * `DELETE FROM projects` запись о выданной базе исчезает, и сносить будет уже
 * нечего.
 *
 * Если кластер недоступен, сирота всё же остаётся — но она ДЕТЕРМИНИРОВАННО
 * названа `app_<projectId>`, поэтому находится сканированием схем вида `app_\d+`,
 * которым не соответствует ни один существующий проект. Это единственная
 * причина, по которой имя схемы построено от id, а не от случайного суффикса.
 */
export async function releaseAppDatabase(projectId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const existing = db.prepare(`SELECT 1 FROM app_databases WHERE project_id = ?`).get(projectId)
    if (!existing) return { ok: true }

    const dropped = await dropAppDatabase(projectId)
    if (!dropped.ok) {
      /* Запись НЕ удаляем: пока схема жива в кластере, забыть про неё —
         значит превратить её в невидимую сироту раньше времени. */
      captureError(
        `[app-database] схема проекта ${projectId} осталась в кластере: ${dropped.error}`,
        new Error(dropped.error ?? "drop failed"),
      )
      return dropped
    }

    db.prepare(`DELETE FROM app_databases WHERE project_id = ?`).run(projectId)
    return { ok: true }
  } catch (err) {
    captureError(`[app-database] не удалось освободить базу проекта ${projectId}:`, err)
    return { ok: false, error: "не удалось освободить базу приложения" }
  }
}
