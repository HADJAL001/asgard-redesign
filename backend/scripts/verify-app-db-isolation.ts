import { execFileSync, execFile } from "node:child_process"
import { promisify } from "node:util"
import { Client } from "pg"

/* ================================================================
   Гейт волны DB-C: у приложения есть СВОЯ база, и чужую он не видит.

   Проверяется не рассуждением о грантах, а фактом на живом Postgres:
   поднимается настоящий контейнер, платформа выдаёт базы двум разным
   приложениям, каждое пишет в свою схему — и затем роль первого
   приложения ПЫТАЕТСЯ прочитать данные второго. Гейт зелёный только
   если попытка отвергнута самой базой.

   Это главный риск всей волны: наивная реализация «одна общая роль на
   все приложения» выглядит работающей ровно до первой утечки, потому
   что успешные сценарии в ней проходят одинаково. Отрицательная
   проверка — единственная, которая эту разницу видит.

   Запуск (из backend/): npx tsx scripts/verify-app-db-isolation.ts
   По умолчанию поднимает Postgres в Docker и сносит его за собой.

   Если Docker недоступен (на dev-машине это бывает), можно дать гейту
   ЛЮБОЙ живой кластер с правами создавать схемы и роли:

     GATE_DATABASE_URL=postgresql://postgres:...@127.0.0.1:5433/apps \
       npx tsx scripts/verify-app-db-isolation.ts

   Тогда контейнер не поднимается и не сносится. Проверка от этого не
   слабеет: она вся про поведение настоящего Postgres, а не про Docker.
   Чего гейт НЕ делает — не подменяет базу заглушкой: доказывать изоляцию
   на моке значит доказывать свойства мока.

   В базу платформы (sqlite) не пишет — проверяется сервис провижининга.
   ================================================================ */

const execFileAsync = promisify(execFile)

const CONTAINER = "osgard-db-isolation-gate"
const PG_IMAGE = "postgres:16-alpine"
const PG_PASSWORD = "gate-admin-password"
const PG_PORT = 55433
const APP_A = 90001
const APP_B = 90002

/** Внешний кластер вместо Docker, если он задан. */
const EXTERNAL_URL = process.env.GATE_DATABASE_URL?.trim()
const usesDocker = !EXTERNAL_URL

type Check = { name: string; ok: boolean; detail: string }
const checks: Check[] = []

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail })
  console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`)
}

function docker(args: string[], allowFailure = false): string {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  } catch (err: any) {
    if (allowFailure) return String(err?.stderr ?? err?.message ?? "")
    throw err
  }
}

async function startPostgres(): Promise<void> {
  /* Контейнер с прошлого прогона мог остаться (гейт мог быть прерван) — сносим,
     иначе `docker run` откажет по занятому имени и гейт «упадёт» не по делу. */
  docker(["rm", "-f", CONTAINER], true)

  console.log(`[gate] поднимаю ${PG_IMAGE} на порту ${PG_PORT}...`)
  docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    `POSTGRES_PASSWORD=${PG_PASSWORD}`,
    "-e",
    "POSTGRES_DB=apps",
    "-p",
    `${PG_PORT}:5432`,
    PG_IMAGE,
  ])

  /* Ждём готовности через pg_isready ВНУТРИ контейнера, а не через попытку
     подключения снаружи: локальные TCP-пробы на этой машине лгут (соединение
     «успешно» даже к закрытому порту), поэтому спрашиваем сам Postgres. */
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const out = docker(["exec", CONTAINER, "pg_isready", "-U", "postgres", "-d", "apps"], true)
    if (/accepting connections/.test(out)) {
      console.log("[gate] Postgres принимает подключения")
      return
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error("Postgres не поднялся за 90с")
}

/** Живёт ли строка подключения. Нужна для отрицательных проверок (ротация пароля). */
async function canConnect(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 })
  try {
    await client.connect()
    await client.query("SELECT 1")
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

/** Пишет строку в схему приложения ЕГО ролью — так же, как это делал бы сам код приложения. */
async function seedApp(connectionString: string, marker: string): Promise<void> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 })
  await client.connect()
  try {
    await client.query(`INSERT INTO notes (title) VALUES ($1)`, [marker])
  } finally {
    await client.end().catch(() => {})
  }
}

async function main(): Promise<void> {
  if (usesDocker) {
    await startPostgres()
  } else {
    console.log("[gate] Docker не используется: кластер задан через GATE_DATABASE_URL")
  }

  /* Админская строка — то, что в проде придёт из окружения. Ставим ДО импорта
     сервиса: он читает переменную в момент вызова, но так гейт ближе к прод-пути. */
  process.env.APPS_DATABASE_URL = EXTERNAL_URL ?? `postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/apps`

  const { provisionAppDatabase, applyAppSchema, dropAppDatabase, isAppDatabaseConfigured } = await import(
    "../src/services/app-database.service"
  )

  record("кластер распознан как настроенный", isAppDatabaseConfigured(), "APPS_DATABASE_URL задан")

  /* ---------- 1. Платформа выдаёт базы двум разным приложениям ---------- */
  const a = await provisionAppDatabase(APP_A)
  const b = await provisionAppDatabase(APP_B)
  if (!a.ok || !b.ok) {
    record("выдача баз двум приложениям", false, `A: ${a.ok ? "ok" : a.error} | B: ${b.ok ? "ok" : b.error}`)
    return finish()
  }
  record("выдача баз двум приложениям", true, `${a.credentials.schema} и ${b.credentials.schema}`)

  /* ---------- 2. Повторная выдача идемпотентна по схеме и РОТИРУЕТ пароль ----------
     Ротация — осознанное свойство: платформа хранит пароль зашифрованным и не умеет
     «вспомнить» прежний, поэтому перевыдаёт новый. Обратная сторона тоже проверяется
     фактом: старая строка подключения после этого мертва, и код, который где-то её
     закешировал, обязан перечитать креды у платформы. Промолчать об этом значило бы
     оставить владельцу приложения необъяснимое `password authentication failed`. */
  const again = await provisionAppDatabase(APP_A)
  record(
    "повторная выдача не создаёт вторую схему",
    again.ok && again.created === false && again.credentials.schema === a.credentials.schema,
    again.ok ? `created=${again.created} (ожидается false)` : String(again.error),
  )
  if (!again.ok) return finish()

  const staleAlive = await canConnect(a.credentials.connectionString)
  const freshAlive = await canConnect(again.credentials.connectionString)
  record(
    "повторная выдача ротирует пароль: прежняя строка мертва, новая жива",
    !staleAlive && freshAlive,
    `прежняя подключается: ${staleAlive} (ожидается false), новая: ${freshAlive} (ожидается true)`,
  )

  /* Дальше работаем ТОЛЬКО актуальными кредами A. */
  const credA = again.credentials

  /* ---------- 3. Приложение объявляет таблицы и пишет данные ---------- */
  const schemaSql = `CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`

  const appliedA = await applyAppSchema(credA, schemaSql)
  const appliedB = await applyAppSchema(b.credentials, schemaSql)
  record(
    "db/schema.sql применён ролью приложения",
    appliedA.ok && appliedB.ok,
    appliedA.ok && appliedB.ok ? "таблицы созданы в обеих схемах" : `${appliedA.error ?? ""} ${appliedB.error ?? ""}`,
  )
  if (!appliedA.ok || !appliedB.ok) return finish()

  await seedApp(credA.connectionString, "секрет приложения A")
  await seedApp(b.credentials.connectionString, "секрет приложения B")
  record("приложение реально пишет в свою базу", true, "по строке в каждой схеме")

  /* ---------- 4. Каждое видит СВОИ данные и только их ---------- */
  const clientA = new Client({ connectionString: credA.connectionString, connectionTimeoutMillis: 10_000 })
  await clientA.connect()
  try {
    const own = await clientA.query<{ title: string }>(`SELECT title FROM notes`)
    record(
      "приложение читает свои данные",
      own.rows.length === 1 && own.rows[0].title === "секрет приложения A",
      `строк: ${own.rows.length}, содержимое: ${own.rows.map((r) => r.title).join(", ")}`,
    )

    /* ГЛАВНАЯ проверка волны: A в лоб адресует схему B. Успех здесь означал бы,
       что данные всех сгенерированных приложений лежат в одной песочнице. */
    let denied = false
    let denialDetail = "чужие данные ПРОЧИТАНЫ — изоляции нет"
    try {
      const stolen = await clientA.query(`SELECT title FROM ${b.credentials.schema}.notes`)
      denialDetail = `прочитано строк: ${stolen.rowCount} (${stolen.rows.map((r: any) => r.title).join(", ")})`
    } catch (err: any) {
      denied = /permission denied|нет доступа|does not exist/i.test(String(err?.message))
      denialDetail = `база отказала: ${String(err?.message).slice(0, 120)}`
    }
    record("чужую схему прочитать НЕЛЬЗЯ", denied, denialDetail)

    /* Записать в чужую схему — тоже нельзя. Отдельная проверка: гранты на чтение
       и запись в Postgres разные, и «читать не может» не значит «писать не может». */
    let writeDenied = false
    let writeDetail = "запись в чужую схему УДАЛАСЬ — изоляции нет"
    try {
      await clientA.query(`INSERT INTO ${b.credentials.schema}.notes (title) VALUES ('подделка от A')`)
    } catch (err: any) {
      writeDenied = true
      writeDetail = `база отказала: ${String(err?.message).slice(0, 120)}`
    }
    record("в чужую схему писать НЕЛЬЗЯ", writeDenied, writeDetail)

    /* Публичная схема закрыта: иначе два приложения встретились бы в общем public. */
    let publicDenied = false
    let publicDetail = "таблица в public СОЗДАНА — общая песочница осталась"
    try {
      await clientA.query(`CREATE TABLE public.gate_probe (id INT)`)
    } catch (err: any) {
      publicDenied = true
      publicDetail = `база отказала: ${String(err?.message).slice(0, 120)}`
    }
    record("в public писать НЕЛЬЗЯ", publicDenied, publicDetail)

    /* Роль приложения не должна уметь заводить роли/базы: сгенерированный ИИ код
       исполняется с этими правами. */
    let escalationDenied = false
    let escalationDetail = "роль СОЗДАНА — приложение может расширить себе права"
    try {
      await clientA.query(`CREATE ROLE gate_probe_role LOGIN PASSWORD 'x'`)
    } catch (err: any) {
      escalationDenied = true
      escalationDetail = `база отказала: ${String(err?.message).slice(0, 120)}`
    }
    record("роль приложения не может заводить роли", escalationDenied, escalationDetail)
  } finally {
    await clientA.end().catch(() => {})
  }

  /* ---------- 5. Хранение кредов: в базе платформы не plaintext ---------- */
  const { encrypt, decrypt } = await import("../src/utils/encryption")
  const cipher = encrypt(credA.connectionString)
  const password = new URL(credA.connectionString).password
  record(
    "строка подключения шифруется при хранении",
    !cipher.includes(password) && !cipher.includes(credA.role) && decrypt(cipher) === credA.connectionString,
    `шифротекст не содержит пароля и роли, расшифровка совпадает (${cipher.slice(0, 12)}...)`,
  )

  /* ---------- 6. Снос базы вместе с проектом ---------- */
  const droppedB = await dropAppDatabase(APP_B)
  let schemaGone = false
  const admin = new Client({ connectionString: process.env.APPS_DATABASE_URL, connectionTimeoutMillis: 10_000 })
  await admin.connect()
  try {
    const left = await admin.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [
      b.credentials.schema,
    ])
    const roleLeft = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [b.credentials.role])
    schemaGone = left.rowCount === 0 && roleLeft.rowCount === 0
  } finally {
    await admin.end().catch(() => {})
  }
  record(
    "снос базы убирает и схему, и роль",
    droppedB.ok && schemaGone,
    schemaGone ? "ни схемы, ни роли в кластере не осталось" : "в кластере остались сироты",
  )

  finish()
}

function finish(): never {
  const failed = checks.filter((c) => !c.ok)
  console.log(`\n[gate] проверок: ${checks.length}, провалено: ${failed.length}`)
  if (failed.length > 0) {
    console.log("[gate] ПРОВАЛЕНО:")
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  process.exit(failed.length === 0 ? 0 : 1)
}

/**
 * Уборка за гейтом. Свой контейнер сносим целиком: оставленный Postgres с
 * известным паролем на локальном порту — не то, что стоит забывать. Чужой
 * кластер (GATE_DATABASE_URL) не выключаем — он не наш; но схемы и роли,
 * которые гейт в нём насоздавал, обязаны исчезнуть, иначе проверка мусорит в
 * рабочей базе.
 */
async function cleanup(): Promise<void> {
  if (usesDocker) {
    console.log("[gate] сношу контейнер...")
    docker(["rm", "-f", CONTAINER], true)
    return
  }
  if (!process.env.APPS_DATABASE_URL) return
  try {
    const { dropAppDatabase } = await import("../src/services/app-database.service")
    for (const id of [APP_A, APP_B]) await dropAppDatabase(id)
    console.log("[gate] тестовые схемы и роли убраны из внешнего кластера")
  } catch (err: any) {
    console.error(`[gate] не удалось убрать тестовые схемы: ${err?.message ?? err}`)
  }
}

main()
  .catch(async (err) => {
    console.error("[gate] ОШИБКА ПРОГОНА:", err?.message ?? err)
    if (usesDocker) docker(["logs", "--tail", "40", CONTAINER], true)
    record("прогон гейта завершился без ошибок", false, String(err?.message ?? err))
  })
  .finally(async () => {
    await cleanup()
    finish()
  })
