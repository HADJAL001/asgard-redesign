import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · Волна 7, пункт 4 · ЖИВАЯ приёмка (запуском, не файлом)
   ----------------------------------------------------------------
   Юнит-тесты доказывают, что функция preflight() считает верно.
   Они НЕ доказывают, что маршрут поднят, висит за авторизацией и
   доходит до клиента: ровно это уже один раз пряталось за зелёным
   файловым гейтом. Поэтому здесь поднимается настоящий сервер,
   регистрируется настоящий пользователь и бьётся настоящий HTTP.

   Прибор обязан уметь краснеть. Негативные контроли, каждый из
   которых назван ЗАРАНЕЕ (условие У-11):
     • без токена  → 401, а не 200 (иначе заявки чужих утекают);
     • абракадабра → cls === "unknown", а не выдуманный класс
       (иначе «класс определён» ничего не значит — он всегда есть).
   ================================================================ */

const PORT = 3985
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-preflight-live.db"
const backendRoot = path.resolve(__dirname, "../..")
const dbAbsolutePath = path.resolve(backendRoot, DB_RELATIVE_PATH)
const tsxCliPath = require.resolve("tsx/cli")

let serverProcess: ChildProcess

async function cleanupDbFiles() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = dbAbsolutePath + suffix
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!fs.existsSync(p)) break
      try {
        fs.rmSync(p)
        break
      } catch (err) {
        if (attempt === 9) throw err
        await new Promise((r) => setTimeout(r, 200))
      }
    }
  }
}

/* 20 секунд не хватает: сервер прогоняет ~60 миграций перед тем, как ответить /health.
   Первый прогон упал именно на этом, а не на маршруте — таймаут прибора, а не дефект. */
async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) return
    } catch {
      /* ждём старта */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("Тестовый сервер не поднялся вовремя")
}

function runInitDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [tsxCliPath, "src/scripts/init-db.ts"], {
      cwd: backendRoot,
      env: { ...process.env, DB_PATH: DB_RELATIVE_PATH, NODE_ENV: "test" },
      stdio: "ignore",
    })
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`init-db exit ${code}`))))
    p.on("error", reject)
  })
}

async function register(): Promise<string> {
  const username = `pfl_${Date.now() % 100_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "password123" }),
  })
  assert.equal(res.status, 201, "регистрация должна вернуть 201")
  const data = (await res.json()) as { token: string }
  assert.ok(data.token, "регистрация должна вернуть токен")
  return data.token
}

type LivePreflight = {
  cls: string
  classLabel: string
  capabilities: string[]
  evidence: string[]
  similar: { total: number; deployed: number; refined: number; broken: number; refinedShare: number | null }
  gaps: Array<{ kind: string; what: string; risk: string; fact: unknown }>
  measured: boolean
}

async function askPreflight(token: string | null, name: string, hint: string) {
  return fetch(`${BASE_URL}/projects/preflight`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name, hint }),
  })
}

before(async () => {
  await cleanupDbFiles()
  await runInitDb()
  serverProcess = spawn(process.execPath, [tsxCliPath, "src/server.ts"], {
    cwd: backendRoot,
    env: { ...process.env, PORT: String(PORT), DB_PATH: DB_RELATIVE_PATH, NODE_ENV: "test" },
    stdio: "ignore",
  })
  await waitForHealth()
})

after(async () => {
  serverProcess.kill()
  await new Promise((r) => setTimeout(r, 300))
  await cleanupDbFiles()
})

test("НЕГАТИВНЫЙ КОНТРОЛЬ: без токена /projects/preflight отвечает 401, а не 200", async () => {
  const res = await askPreflight(null, "Маркетплейс мастеров", "каталог, корзина, оплата картой")
  assert.equal(res.status, 401, "чужая заявка не должна разбираться без авторизации")
})

test("живьём: внятная заявка — класс выведен, показаны слова-основания, названы пробелы", async () => {
  const token = await register()
  const res = await askPreflight(
    token,
    "Маркетплейс для мастеров",
    "каталог товаров, корзина и оплата картой, отзывы покупателей",
  )
  assert.equal(res.status, 200)
  const { preflight } = (await res.json()) as { preflight: LivePreflight }

  // (а) что за продукт — класс, а не тема из словаря
  assert.notEqual(preflight.cls, "unknown", "по такой заявке класс обязан выводиться")
  assert.ok(preflight.classLabel.length > 0, "класс должен называться человеческими словами")
  assert.ok(preflight.evidence.length > 0, "ответ обязан быть проверяем: показываем слова-основания")

  // (б) корпус пуст — платформа честно говорит «фактов нет», а не рисует проценты
  assert.equal(preflight.measured, false, "на пустой БД похожих быть не может")
  assert.equal(preflight.similar.total, 0)
  assert.equal(preflight.similar.refinedShare, null, "0 случаев ⇒ доля null, а не 0%")

  // Дефект, найденный ЖИВЫМ прострелом: «оплата картой» опознавалась как карта местности,
  // и человеку показывалось слово-основание «карт». Ложное основание выглядит как довод.
  assert.ok(!preflight.capabilities.includes("geo-map"), "«оплата картой» — не гео")
  assert.ok(!preflight.evidence.includes("карт"), "нельзя показывать «карт» как основание для гео")

  // (в) что не определено — с последствием, а не выговором
  assert.ok(preflight.gaps.length > 0, "оплата без цены и без входа — это пробелы")
  for (const gap of preflight.gaps) {
    assert.ok(gap.what.length > 0, "пробел обязан быть назван")
    assert.ok(gap.risk.length > 0, "пробел без следствия — придирка")
  }
})

test("НЕГАТИВНЫЙ КОНТРОЛЬ: абракадабра живьём даёт unknown, а не выдуманный класс", async () => {
  const token = await register()
  const res = await askPreflight(token, "фыва йцукен", "ололо трололо жжж")
  assert.equal(res.status, 200)
  const { preflight } = (await res.json()) as { preflight: LivePreflight }
  assert.equal(preflight.cls, "unknown", "прибор, у которого всё зелёное, ничего не измеряет")
  assert.equal(preflight.capabilities.length, 0)
})

test("живьём: /projects/platform-memory отдаёт числа «взгляда наперёд» для /dev/memory", async () => {
  const token = await register()
  const res = await fetch(`${BASE_URL}/projects/platform-memory`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(res.status, 200)
  const data = (await res.json()) as {
    foresight?: { projects: number; classified: number; classifiedShare: number | null; byClass: unknown[] }
  }
  assert.ok(data.foresight, "витрина наблюдаемости обязана получать раздел foresight")
  assert.equal(typeof data.foresight!.projects, "number")
  assert.equal(typeof data.foresight!.classified, "number")
  assert.ok(Array.isArray(data.foresight!.byClass))
  /* Доля выдумываться не должна: если проектов нет — null, если есть — доля от их числа.
     Ждать здесь null было бы неверно: init-db сеет демо-проекты, и база не пуста.
     Проверка «null на пустой базе» живёт в юнит-наборе, где база действительно пуста. */
  const { projects, classified, classifiedShare } = data.foresight!
  if (projects === 0) {
    assert.equal(classifiedShare, null, "0 проектов ⇒ делить не на что, доля null, а не 0%")
  } else {
    assert.equal(classifiedShare, classified / projects, "доля обязана быть долей, а не оценкой")
    assert.ok(classifiedShare! >= 0 && classifiedShare! <= 1)
  }
})
