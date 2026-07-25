// ПЕРВОЙ строкой: форсирует DB_PATH=:memory: до загрузки lib/db (импорты
// исполняются по порядку) — см. helpers/use-memory-db. Иначе db-синглтон
// открыл бы боевую ./data/osgard.db.
import "./helpers/use-memory-db"
import { test } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"

/* ================================================================
   OSGARD · provably-fair — честно проверяемая гача (commit-reveal).
   Проверяем на реальной (in-memory) SQLite, что:
     • commit = sha256(server_seed) — обязательство дома;
     • deriveFloats/verifyFloats ЧИСТЫ и детерминированы: тот же вход
       → тот же выход, все ∈ [0,1), count>1 даёт разные значения;
     • nextFloats воспроизводим из сохранённых входов (леджер честен),
       атомарно инкрементит nonce и пишет строку доказательства;
     • rotateSeed РАСКРЫВАЕТ старый server_seed, сбрасывает nonce=0 —
       после чего прошлый бросок независимо пересчитывается verifyFloats;
     • client_seed валидируется (энтропия игрока под контролем);
     • getPublicCommit НИКОГДА не светит активный server_seed;
     • распределение статов 1:1 с прежним Math.random (экономика цела).
   ================================================================ */

import {
  hashServerSeed,
  deriveFloats,
  verifyFloats,
  normalizeClientSeed,
  getOrCreateSeed,
  getPublicCommit,
  setClientSeed,
  rotateSeed,
  nextFloats,
  getRecentRolls,
  ProvablyFairError,
  CLIENT_SEED_MAX,
  type SeedRow,
} from "../lib/provably-fair"
import db from "../lib/db"

// Минимальная схема под тесты: users (FK-цель) + две provably-fair таблицы
// (как в миграции 088).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT);
  CREATE TABLE IF NOT EXISTS provably_fair_seeds (
    user_id               INTEGER PRIMARY KEY,
    server_seed           TEXT NOT NULL,
    server_seed_hash      TEXT NOT NULL,
    client_seed           TEXT NOT NULL,
    nonce                 INTEGER NOT NULL DEFAULT 0,
    prev_server_seed      TEXT,
    prev_server_seed_hash TEXT,
    prev_nonce            INTEGER,
    rotated_at            INTEGER,
    created_at            INTEGER NOT NULL DEFAULT 0,
    updated_at            INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS provably_fair_rolls (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL,
    server_seed_hash  TEXT NOT NULL,
    client_seed       TEXT NOT NULL,
    nonce             INTEGER NOT NULL,
    purpose           TEXT NOT NULL,
    count             INTEGER NOT NULL DEFAULT 1,
    results_json      TEXT NOT NULL,
    context           TEXT,
    created_at        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_pf_rolls_user ON provably_fair_rolls(user_id, id DESC);
`)

let nextUserId = 1
function freshUser(): number {
  const id = nextUserId++
  db.prepare(`INSERT INTO users (id, email) VALUES (?, ?)`).run(id, `u${id}@test.local`)
  return id
}

function rawSeedRow(userId: number): SeedRow {
  return db.prepare(`SELECT * FROM provably_fair_seeds WHERE user_id = ?`).get(userId) as SeedRow
}

/* ---------------- Чистые функции (без БД) ---------------- */

test("hashServerSeed === sha256(server_seed)", () => {
  const seed = crypto.randomBytes(32).toString("hex")
  const expected = crypto.createHash("sha256").update(seed).digest("hex")
  assert.equal(hashServerSeed(seed), expected)
  assert.match(hashServerSeed(seed), /^[0-9a-f]{64}$/)
})

test("deriveFloats детерминирован, в [0,1), count>1 → разные значения", () => {
  const s = "a".repeat(64)
  const a = deriveFloats(s, "player", 0, "starter:1:0", 5)
  const b = deriveFloats(s, "player", 0, "starter:1:0", 5)
  assert.deepEqual(a, b, "тот же вход → тот же выход")
  assert.equal(a.length, 5)
  for (const f of a) {
    assert.ok(f >= 0 && f < 1, `float в [0,1): ${f}`)
  }
  // count>1 разводит суффиксом :i — значения не совпадают между собой.
  assert.equal(new Set(a).size, 5, "5 различных float'ов из одного nonce")
})

test("count=1 отличается от нулевого элемента count>1 (нет суффикса)", () => {
  const s = "b".repeat(64)
  const single = deriveFloats(s, "p", 3, "roll", 1)
  const multi = deriveFloats(s, "p", 3, "roll", 5)
  assert.equal(single.length, 1)
  // single использует base без `:0`, multi[0] — base+`:0` → это РАЗНЫЕ сообщения.
  assert.notEqual(single[0], multi[0])
})

test("разный nonce/purpose/clientSeed → разные потоки", () => {
  const s = "c".repeat(64)
  assert.notEqual(deriveFloats(s, "p", 0, "x", 1)[0], deriveFloats(s, "p", 1, "x", 1)[0])
  assert.notEqual(deriveFloats(s, "p", 0, "x", 1)[0], deriveFloats(s, "p", 0, "y", 1)[0])
  assert.notEqual(deriveFloats(s, "p", 0, "x", 1)[0], deriveFloats(s, "q", 0, "x", 1)[0])
})

test("verifyFloats — тот же чистый расчёт, что и deriveFloats", () => {
  const s = "d".repeat(64)
  assert.deepEqual(verifyFloats(s, "seed", 7, "starter:9:2", 5), deriveFloats(s, "seed", 7, "starter:9:2", 5))
})

test("normalizeClientSeed: валидация энтропии игрока", () => {
  assert.equal(normalizeClientSeed("my-seed_123"), "my-seed_123")
  assert.equal(normalizeClientSeed("  trimmed  "), "trimmed")
  assert.equal(normalizeClientSeed(""), null)
  assert.equal(normalizeClientSeed("   "), null)
  assert.equal(normalizeClientSeed("a".repeat(CLIENT_SEED_MAX + 1)), null)
  assert.equal(normalizeClientSeed("a".repeat(CLIENT_SEED_MAX)), "a".repeat(CLIENT_SEED_MAX))
  assert.equal(normalizeClientSeed("bad seed"), null, "пробел внутри запрещён")
  assert.equal(normalizeClientSeed("emoji😀"), null, "не-ASCII запрещён")
  assert.equal(normalizeClientSeed(42), null)
  assert.equal(normalizeClientSeed(null), null)
})

/* ---------------- Сид-цепочка + леджер (БД) ---------------- */

test("getOrCreateSeed: lazy, идемпотентно, commit = sha256(server_seed)", () => {
  const u = freshUser()
  const row = getOrCreateSeed(u)
  assert.equal(row.nonce, 0)
  assert.equal(row.server_seed_hash, hashServerSeed(row.server_seed), "commit сходится с секретом")
  assert.ok(row.client_seed.length > 0)
  // Повторный вызов не создаёт новую цепочку.
  const again = getOrCreateSeed(u)
  assert.equal(again.server_seed, row.server_seed)
})

test("getPublicCommit не раскрывает активный server_seed", () => {
  const u = freshUser()
  const commit = getPublicCommit(u)
  assert.ok(!("serverSeed" in commit), "нет активного server_seed в публичном commit")
  assert.equal(commit.serverSeedHash, rawSeedRow(u).server_seed_hash)
  assert.equal(commit.previous, null, "до ротации истории нет")
  // Значение секрета не должно протечь ни в какое поле верхнего уровня.
  assert.ok(!JSON.stringify(commit).includes(rawSeedRow(u).server_seed))
})

test("nextFloats воспроизводим из леджера, атомарно инкрементит nonce", () => {
  const u = freshUser()
  const before = getOrCreateSeed(u) // создаёт сид-цепочку и возвращает её строку
  const serverSeed = before.server_seed // секрет знаем в тесте (в проде — до ротации)

  const floats = nextFloats(u, "starter:1:0", 5, "project 1 · Меч")
  assert.equal(floats.length, 5)

  // Независимая проверка: verifyFloats из тех же входов даёт тот же результат.
  assert.deepEqual(
    verifyFloats(serverSeed, before.client_seed, before.nonce, "starter:1:0", 5),
    floats,
  )

  // nonce вырос ровно на 1; в леджере одна строка с сохранёнными входами.
  assert.equal(rawSeedRow(u).nonce, before.nonce + 1)
  const rolls = getRecentRolls(u)
  assert.equal(rolls.length, 1)
  assert.equal(rolls[0].nonce, before.nonce)
  assert.equal(rolls[0].count, 5)
  assert.equal(rolls[0].purpose, "starter:1:0")
  assert.deepEqual(rolls[0].results, floats, "леджер хранит ровно выданные float'ы")
  assert.equal(rolls[0].serverSeedHash, before.server_seed_hash)
})

test("последовательные nextFloats: nonce монотонен, леджер растёт", () => {
  const u = freshUser()
  const a = nextFloats(u, "p", 1)
  const b = nextFloats(u, "p", 1)
  assert.notDeepEqual(a, b, "разный nonce → разный поток")
  assert.equal(rawSeedRow(u).nonce, 2)
  assert.equal(getRecentRolls(u).length, 2)
  // getRecentRolls — по id DESC: последний бросок первым.
  assert.deepEqual(getRecentRolls(u)[0].results, b)
})

test("setClientSeed: валидный применяется, мусор → ProvablyFairError 400", () => {
  const u = freshUser()
  const commit = setClientSeed(u, "chosen-entropy")
  assert.equal(commit.clientSeed, "chosen-entropy")
  assert.equal(rawSeedRow(u).client_seed, "chosen-entropy")

  assert.throws(() => setClientSeed(u, "bad seed with spaces"), (e: unknown) => {
    assert.ok(e instanceof ProvablyFairError)
    assert.equal((e as ProvablyFairError).status, 400)
    return true
  })
  assert.throws(() => setClientSeed(u, ""), ProvablyFairError)
  // Невалидный ввод не затёр прежний client_seed.
  assert.equal(rawSeedRow(u).client_seed, "chosen-entropy")
})

test("смена client_seed меняет поток при том же nonce", () => {
  const u = freshUser()
  const s = getOrCreateSeed(u).server_seed
  setClientSeed(u, "seed-A")
  const rowA = rawSeedRow(u)
  const withA = deriveFloats(s, "seed-A", rowA.nonce, "x", 1)[0]
  const withB = deriveFloats(s, "seed-B", rowA.nonce, "x", 1)[0]
  assert.notEqual(withA, withB)
})

test("rotateSeed: раскрывает старый seed, сбрасывает nonce, прошлое проверяемо", () => {
  const u = freshUser()
  const before = getOrCreateSeed(u)
  const oldServerSeed = before.server_seed

  // Сделаем бросок ДО ротации — его надо будет пересчитать после раскрытия.
  const pastFloats = nextFloats(u, "starter:5:0", 5, "before rotation")
  const rollNonce = before.nonce // бросок сделан на этом nonce

  const { revealed, next } = rotateSeed(u)

  // Раскрыт именно прежний секрет, и его hash сходится.
  assert.equal(revealed.serverSeed, oldServerSeed)
  assert.equal(revealed.serverSeedHash, hashServerSeed(oldServerSeed))
  assert.equal(hashServerSeed(revealed.serverSeed), before.server_seed_hash)

  // Новый commit: nonce=0, новый seed (≠ старому), previous заполнен раскрытым seed.
  assert.equal(next.nonce, 0)
  assert.notEqual(rawSeedRow(u).server_seed, oldServerSeed)
  assert.ok(next.previous)
  assert.equal(next.previous!.serverSeed, oldServerSeed)

  // ГЛАВНОЕ: имея раскрытый server_seed, независимо пересчитываем прошлый бросок.
  const recomputed = verifyFloats(revealed.serverSeed, before.client_seed, rollNonce, "starter:5:0", 5)
  assert.deepEqual(recomputed, pastFloats, "дом не мог подкрутить — hash был зафиксирован до броска")
})

/* ---------------- Экономика: распределение не изменилось ---------------- */

test("статы floor(f*30) ∈ [0,29], среднее ≈ прежнего Math.random", () => {
  const u = freshUser()
  const stats: number[] = []
  for (let i = 0; i < 400; i++) {
    const [f] = nextFloats(u, `dist:${i}`, 1)
    const stat = Math.floor(f * 30) // прежняя формула: 10 + floor(rand*30) — сдвиг +10 постоянен
    assert.ok(stat >= 0 && stat <= 29, `stat в [0,29]: ${stat}`)
    stats.push(stat)
  }
  const mean = stats.reduce((a, b) => a + b, 0) / stats.length
  // Ожидание floor(U*30) ≈ 14.5; допускаем разумный разброс на 400 бросках.
  assert.ok(mean > 11 && mean < 18, `среднее стата в норме: ${mean}`)
})
