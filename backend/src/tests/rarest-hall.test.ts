import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты публичного «Зала редчайших» (lib/rarest-hall.ts, п.6).
   Ранжирование по craftScore, исключение legacy (craft_score NULL),
   отсутствие PII (owner_id/email) в публичной сериализации, пагинация.
   In-memory БД; DB_PATH=:memory: до импорта lib/db. Минимальные схемы
   artifacts/users (только колонки, которые читает модуль).
   ================================================================ */

let db: any
let listRarestArtifacts: typeof import("../lib/rarest-hall").listRarestArtifacts
let countRarestArtifacts: typeof import("../lib/rarest-hall").countRarestArtifacts
let getRarestArtifactById: typeof import("../lib/rarest-hall").getRarestArtifactById

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      display_name TEXT
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'weapon',
      rarity TEXT NOT NULL DEFAULT 'common',
      craft_score REAL,
      visual_theme TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `)
  ;({ listRarestArtifacts, countRarestArtifacts, getRarestArtifactById } = await import("../lib/rarest-hall"))
})

beforeEach(() => {
  db.exec("DELETE FROM artifacts; DELETE FROM users;")
})

let artifactId = 0
function artifact(opts: {
  ownerId?: number | null
  craftScore?: number | null
  name?: string
  visualTheme?: string | null
  createdAt?: number
}) {
  db.prepare(
    `INSERT INTO artifacts (id, owner_id, name, craft_score, visual_theme, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    ++artifactId,
    opts.ownerId ?? null,
    opts.name ?? `Артефакт ${artifactId}`,
    opts.craftScore ?? null,
    opts.visualTheme ?? null,
    opts.createdAt ?? Date.now(),
  )
  return artifactId
}

function user(id: number, username: string | null, displayName: string | null) {
  db.prepare(`INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)`).run(id, username, displayName)
}

test("rarest-hall: сортировка по craftScore DESC, при равенстве — по id ASC (стабильно)", () => {
  const low = artifact({ craftScore: 0.5 })
  const highA = artifact({ craftScore: 0.9 })
  const highB = artifact({ craftScore: 0.9 })
  const list = listRarestArtifacts(10, 0)
  assert.equal(list.length, 3)
  assert.equal(list[0].id, highA, "при равном craftScore меньший id идёт первым")
  assert.equal(list[1].id, highB)
  assert.equal(list[2].id, low)
})

test("rarest-hall: legacy-артефакты с craft_score=NULL не участвуют", () => {
  artifact({ craftScore: null })
  artifact({ craftScore: 0.7 })
  const list = listRarestArtifacts(10, 0)
  assert.equal(list.length, 1)
  assert.equal(countRarestArtifacts(), 1)
})

test("rarest-hall: публичная сериализация не содержит owner_id, только holderHandle", () => {
  user(1, "vibecoder1", "Настоящее Имя")
  const id = artifact({ craftScore: 0.8, ownerId: 1 })
  const found = getRarestArtifactById(id)
  assert.ok(found)
  assert.equal(found!.holderHandle, "Настоящее Имя", "display_name приоритетнее username")
  assert.ok(!("owner_id" in (found as any)))
  assert.ok(!("ownerId" in (found as any)))
})

test("rarest-hall: holderHandle падает на username, если display_name пуст; null для безвладельца", () => {
  user(2, "onlyusername", null)
  const idWithUser = artifact({ craftScore: 0.6, ownerId: 2 })
  const idNoOwner = artifact({ craftScore: 0.55, ownerId: null })
  assert.equal(getRarestArtifactById(idWithUser)!.holderHandle, "onlyusername")
  assert.equal(getRarestArtifactById(idNoOwner)!.holderHandle, null)
})

test("rarest-hall: visual_theme разбирается в archetype/palette, битый JSON — null безопасно", () => {
  const good = artifact({
    craftScore: 0.7,
    visualTheme: JSON.stringify({ archetype: "Нейрокристалл", palette: { primary: "#111", accent: "#222" } }),
  })
  const bad = artifact({ craftScore: 0.65, visualTheme: "{не json" })
  const noTheme = artifact({ craftScore: 0.6, visualTheme: null })

  const goodRow = getRarestArtifactById(good)!
  assert.equal(goodRow.archetype, "Нейрокристалл")
  assert.deepEqual(goodRow.palette, { primary: "#111", accent: "#222" })

  assert.equal(getRarestArtifactById(bad)!.archetype, null)
  assert.equal(getRarestArtifactById(bad)!.palette, null)
  assert.equal(getRarestArtifactById(noTheme)!.archetype, null)
})

test("rarest-hall: getRarestArtifactById возвращает undefined для legacy (craft_score NULL) и несуществующего id", () => {
  const legacyId = artifact({ craftScore: null })
  assert.equal(getRarestArtifactById(legacyId), undefined)
  assert.equal(getRarestArtifactById(999999), undefined)
})

test("rarest-hall: пагинация limit/offset", () => {
  for (let i = 0; i < 5; i++) artifact({ craftScore: i / 10 })
  const page1 = listRarestArtifacts(2, 0)
  const page2 = listRarestArtifacts(2, 2)
  assert.equal(page1.length, 2)
  assert.equal(page2.length, 2)
  assert.equal(countRarestArtifacts(), 5)
  assert.notDeepEqual(page1.map((a) => a.id), page2.map((a) => a.id))
})
