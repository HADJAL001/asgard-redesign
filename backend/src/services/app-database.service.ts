import { Client } from "pg"
import crypto from "node:crypto"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · База данных на каждое сгенерированное приложение
   ----------------------------------------------------------------
   ЗАЧЕМ. Платформа генерировала витрины: живая прод-генерация дала 48
   файлов приложения, в которых ноль обращений к базе. Продукт, который
   можно продать, без хранения данных не существует.

   МОДЕЛЬ. Один общий кластер Postgres (свой, на узлах osgard-infra —
   решение основателя: сервера уже оплачены, внешней зависимости не
   заводим), и на каждое приложение — СВОЯ СХЕМА и СВОЯ РОЛЬ.

   Изоляция держится не на секретности строки подключения, а на правах
   Postgres, и это принципиально. Наивный вариант «одна общая роль на все
   приложения» означал бы: кто угодно, получив креды своего приложения,
   читает данные всех остальных — достаточно указать другую схему. Здесь
   у роли приложения есть права ТОЛЬКО на его схему:

     • REVOKE ALL ON SCHEMA public — публичная схема недоступна;
     • search_path роли жёстко выставлен в свою схему;
     • нет CREATEDB/CREATEROLE/SUPERUSER, нет прав на другие схемы;
     • REVOKE CONNECT ... FROM PUBLIC на самой базе не делаем (иначе
       сломаем чужие подключения к кластеру) — вместо этого изоляция
       строится на уровне схем, а не базы.

   Проверяется это не рассуждением, а прогоном: scripts/verify-app-db-isolation.ts
   поднимает настоящий Postgres, создаёт две базы приложений и доказывает,
   что роль первого получает `permission denied` на схему второго.

   АДМИН-ПОДКЛЮЧЕНИЕ. `APPS_DATABASE_URL` — строка подключения роли,
   которая имеет право создавать схемы и роли в кластере приложений. Её
   НЕТ в коде и не будет: пока переменная не задана, провижининг честно
   отвечает `configured: false`, а не делает вид, что база выдана.
   ================================================================ */

export type AppDatabaseCredentials = {
  /** Имя схемы приложения в общем кластере. */
  schema: string
  /** Роль Postgres, у которой есть права только на эту схему. */
  role: string
  /** Строка подключения для приложения — то, что уедет в его DATABASE_URL. */
  connectionString: string
}

export type ProvisionOutcome =
  | { ok: true; credentials: AppDatabaseCredentials; created: boolean }
  | { ok: false; configured: boolean; error: string }

/** Настроен ли кластер приложений. false — провижининг честно недоступен. */
export function isAppDatabaseConfigured(): boolean {
  return !!process.env.APPS_DATABASE_URL?.trim()
}

/**
 * Имя схемы/роли приложения. Только `app_<id>`: идентификатор проекта —
 * единственный по-настоящему уникальный и неизменный ключ, а имя проекта
 * пользователь пишет сам (кириллица, эмодзи, коллизии слагов). Пускать
 * пользовательскую строку в идентификатор SQL — приглашение к инъекции.
 */
export function schemaNameFor(projectId: number): string {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(`[app-database] недопустимый projectId: ${projectId}`)
  }
  return `app_${projectId}`
}

export function roleNameFor(projectId: number): string {
  return `${schemaNameFor(projectId)}_owner`
}

/**
 * Идентификатор для SQL. Схемы и роли нельзя передать параметром ($1) — их имена
 * подставляются в текст запроса, поэтому проверяем форму СТРОГО: только имена,
 * которые сами и построили выше. Всё остальное — отказ, а не экранирование.
 */
function assertSafeIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`[app-database] небезопасный идентификатор: ${value}`)
  }
  return value
}

/**
 * Пароль роли приложения: 32 байта энтропии в base64url, то есть алфавит
 * `[A-Za-z0-9_-]` — ни кавычек, ни обратных слэшей, ни символов, которые пришлось
 * бы экранировать в строке подключения.
 */
function generatePassword(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/**
 * Пароль для DDL. Postgres НЕ принимает bind-параметры в служебных командах
 * (`CREATE ROLE ... PASSWORD $1` → `syntax error at or near "$1"`, код 42601) —
 * это не наша недоработка, а свойство протокола: параметры работают только в
 * SELECT/INSERT/UPDATE/DELETE. Значит пароль обязан попасть в ТЕКСТ запроса, и
 * единственное, что делает это безопасным, — контроль над самим значением:
 *
 *   1) форма проверяется явно: только алфавит base64url, который выдаёт
 *      generatePassword(); всё остальное — отказ, а не попытка починить;
 *   2) поверх этого — экранирование драйвером (`escapeLiteral`), чтобы правка
 *      генератора пароля в будущем не превратилась молча в инъекцию.
 *
 * Пароль сюда приходит только из generatePassword() — пользовательские строки в
 * эту функцию не попадают ни на одном пути.
 */
function passwordLiteral(client: Client, password: string): string {
  if (!/^[A-Za-z0-9_-]{22,}$/.test(password)) {
    throw new Error("[app-database] сгенерированный пароль не прошёл проверку формы")
  }
  return client.escapeLiteral(password)
}

/** Строка подключения приложения: та же цель, что у админской, но своя роль/схема. */
function buildConnectionString(adminUrl: string, role: string, password: string, schema: string): string {
  const url = new URL(adminUrl)
  url.username = encodeURIComponent(role)
  url.password = encodeURIComponent(password)
  /* Схема по умолчанию — своя. Дублирует ALTER ROLE ... SET search_path: клиент
     может подключиться и без параметра, а приложение всё равно обязано попадать
     в свою схему, а не в public. */
  url.searchParams.set("options", `-c search_path=${schema}`)
  return url.toString()
}

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.APPS_DATABASE_URL as string
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * Выдаёт приложению его базу: схема + роль с правами только на неё.
 *
 * Идемпотентно по схеме (повторный вызов не роняет уже выданную базу и не теряет
 * данные), но пароль роли ПЕРЕВЫДАЁТСЯ: платформа хранит его зашифрованным и не
 * умеет «вспомнить» прежний, а роль без известного пароля бесполезна. Данные при
 * этом не трогаются — меняется только доступ.
 *
 * Никогда не бросает наружу: генерация приложения не имеет права падать из-за
 * недоступного кластера — тогда пользователь получил бы «ошибку» вместо кода.
 */
export async function provisionAppDatabase(projectId: number): Promise<ProvisionOutcome> {
  if (!isAppDatabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "APPS_DATABASE_URL не задан — кластер баз приложений не подключён",
    }
  }

  let schema: string
  let role: string
  try {
    schema = assertSafeIdentifier(schemaNameFor(projectId))
    role = assertSafeIdentifier(roleNameFor(projectId))
  } catch (err: any) {
    return { ok: false, configured: true, error: err?.message ?? "недопустимое имя схемы" }
  }

  const password = generatePassword()

  try {
    const created = await withAdminClient(async (client) => {
      const existing = await client.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [schema])
      const isNew = existing.rowCount === 0

      /* Роль: создаём или перевыдаём пароль. LOGIN без права заводить базы/роли —
         сгенерированный ИИ код исполняется с этими правами, и «немного больше, чем
         нужно» здесь означает доступ к чужим данным. */
      const roleExists = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role])
      const secret = passwordLiteral(client, password)
      if (roleExists.rowCount === 0) {
        await client.query(
          `CREATE ROLE ${role} LOGIN PASSWORD ${secret} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`,
        )
      } else {
        await client.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${secret}`)
      }

      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${role}`)

      /* Права ровно на свою схему и ничего больше. */
      await client.query(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role}`)
      await client.query(`ALTER ROLE ${role} SET search_path = ${schema}`)

      /* Публичная схема закрывается явно: по умолчанию в Postgres < 15 любая роль
         может в неё писать, и два приложения оказались бы в одной песочнице. */
      await client.query(`REVOKE ALL ON SCHEMA public FROM ${role}`)

      return isNew
    })

    return {
      ok: true,
      created,
      credentials: {
        schema,
        role,
        connectionString: buildConnectionString(process.env.APPS_DATABASE_URL as string, role, password, schema),
      },
    }
  } catch (err: any) {
    captureError(`[app-database] не удалось выдать базу проекту ${projectId}:`, err)
    /* Наружу — только суть. Текст ошибки Postgres может содержать строку
       подключения и имя админской роли; в отчёт пользователю этому не место. */
    return { ok: false, configured: true, error: "не удалось создать базу приложения в кластере" }
  }
}

/**
 * Применяет `db/schema.sql` приложения к его схеме — от имени РОЛИ ПРИЛОЖЕНИЯ,
 * не администратора. Это не формальность: скрипт написан ИИ по промпту
 * пользователя, и исполнять его с правами администратора кластера означало бы
 * отдать кластер содержимому промпта. С правами роли приложения худшее, что
 * может сделать такой скрипт, — испортить собственную схему.
 */
export async function applyAppSchema(
  credentials: AppDatabaseCredentials,
  schemaSql: string,
): Promise<{ ok: boolean; error?: string }> {
  const sql = schemaSql.trim()
  if (!sql) return { ok: true }

  const client = new Client({ connectionString: credentials.connectionString, connectionTimeoutMillis: 10_000 })
  try {
    await client.connect()
    await client.query(`SET search_path TO ${assertSafeIdentifier(credentials.schema)}`)
    await client.query(sql)
    return { ok: true }
  } catch (err: any) {
    /* Ошибку СХЕМЫ отдаём как есть: её текст написан про таблицы приложения, он
       нужен пользователю и не содержит наших кредов (подключались уже его ролью). */
    return { ok: false, error: err?.message ?? "не удалось применить схему приложения" }
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * Снос базы приложения — вместе с данными. Вызывается при удалении проекта:
 * схема, которую никто не удалит, остаётся сиротой в кластере навсегда.
 */
export async function dropAppDatabase(projectId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isAppDatabaseConfigured()) return { ok: false, error: "APPS_DATABASE_URL не задан" }
  try {
    const schema = assertSafeIdentifier(schemaNameFor(projectId))
    const role = assertSafeIdentifier(roleNameFor(projectId))
    await withAdminClient(async (client) => {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      /* Роль удаляется ПОСЛЕ схемы: пока она владеет объектами, DROP ROLE
         откажет — и осталась бы висячая роль с валидным паролем. */
      await client.query(`DROP ROLE IF EXISTS ${role}`)
    })
    return { ok: true }
  } catch (err: any) {
    captureError(`[app-database] не удалось снести базу проекта ${projectId}:`, err)
    return { ok: false, error: "не удалось снести базу приложения" }
  }
}
