import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты детектора целостности экономики (AdminController.integrity, #6).
   Read-only аудит wash-trading поверх существующих эконом-таблиц. Проверяем каждый
   вектор отдельно (само-сделка / реципрокные пары / пинг-понг / само-кросс ордербука /
   shill-ставка) + честную сделко-уровневую washTradingRate и защиту от деления на ноль.
   In-memory БД; DB_PATH=:memory: до импорта lib/db. Схемы = миграции 023/001/072.
   ================================================================ */

const DAY_MS = 86400000

let db: any
let AdminController: typeof import("../controllers/admin.controller").AdminController

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  // Минимальные схемы нужных таблиц (только колонки, которые читает ридер).
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      listed_at INTEGER NOT NULL DEFAULT 0,
      sold_at INTEGER,
      buyer_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS tc_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      ts INTEGER NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      side TEXT NOT NULL DEFAULT 'buy',
      origin TEXT NOT NULL DEFAULT 'market',
      buyer_id INTEGER,
      seller_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      start_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auction_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL,
      bidder_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `)
  ;({ AdminController } = await import("../controllers/admin.controller"))
})

beforeEach(() => {
  db.exec("DELETE FROM marketplace_listings; DELETE FROM tc_trades; DELETE FROM auctions; DELETE FROM auction_bids;")
})

// Проданный лот. sellerId/buyerId + время продажи (по умолчанию — в окне).
let listingId = 0
function sell(
  artifactId: number,
  sellerId: number,
  buyerId: number | null,
  opts: { soldAt?: number; status?: string } = {},
) {
  const soldAt = opts.soldAt ?? Date.now() - DAY_MS
  db.prepare(
    `INSERT INTO marketplace_listings (id, artifact_id, seller_id, status, sold_at, buyer_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(++listingId, artifactId, sellerId, opts.status ?? "sold", soldAt, buyerId)
}

function trade(buyerId: number | null, sellerId: number | null, ts = Date.now() - DAY_MS) {
  db.prepare(`INSERT INTO tc_trades (ts, buyer_id, seller_id) VALUES (?, ?, ?)`).run(ts, buyerId, sellerId)
}

function auction(id: number, sellerId: number) {
  db.prepare(`INSERT INTO auctions (id, artifact_id, seller_id) VALUES (?, ?, ?)`).run(id, id * 10, sellerId)
}
function bid(auctionId: number, bidderId: number, ts = Date.now() - DAY_MS) {
  db.prepare(`INSERT INTO auction_bids (auction_id, bidder_id, created_at) VALUES (?, ?, ?)`).run(auctionId, bidderId, ts)
}

function mockRes() {
  const r: any = { statusCode: 200, body: null }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}

async function integrity(days?: number) {
  const req: any = { query: days != null ? { days: String(days) } : {} }
  const res = mockRes()
  await AdminController.integrity(req, res)
  return res
}

test("integrity: пустая экономика — все нули, без деления на ноль", async () => {
  const res = await integrity(30)
  assert.equal(res.statusCode, 200)
  const t = res.body.integrity.totals
  assert.equal(t.soldListings, 0)
  assert.equal(t.selfDeals, 0)
  assert.equal(t.selfDealRate, 0)
  assert.equal(t.reciprocalPairs, 0)
  assert.equal(t.pingPongArtifacts, 0)
  assert.equal(t.selfCrossTrades, 0)
  assert.equal(t.shillBids, 0)
  assert.equal(t.flaggedSales, 0)
  assert.equal(t.washTradingRate, 0)
  assert.deepEqual(res.body.integrity.suspects.reciprocalPairs, [])
  assert.deepEqual(res.body.integrity.suspects.pingPongArtifacts, [])
})

test("integrity: само-сделка (buyer=seller) считается и даёт selfDealRate", async () => {
  sell(1, 7, 7) // само-сделка
  sell(2, 7, 8) // честная
  const t = (await integrity(30)).body.integrity.totals
  assert.equal(t.soldListings, 2)
  assert.equal(t.selfDeals, 1)
  assert.equal(t.selfDealRate, 0.5)
  assert.equal(t.flaggedSales, 1, "помечена только само-сделка")
  assert.equal(t.washTradingRate, 0.5)
})

test("integrity: реципрокная пара A↔B (round-trip) детектится, направление в одну сторону — нет", async () => {
  // Пара (3,4): продажи в обе стороны → реципрокная.
  sell(10, 3, 4)
  sell(11, 4, 3)
  // Пара (5,6): только одно направление → не реципрокная.
  sell(12, 5, 6)
  sell(13, 5, 6)
  const body = (await integrity(30)).body.integrity
  assert.equal(body.totals.reciprocalPairs, 1, "только (3,4)")
  const pair = body.suspects.reciprocalPairs[0]
  assert.equal(pair.userA, 3, "нормализовано min→userA")
  assert.equal(pair.userB, 4)
  assert.equal(pair.trades, 2)
  // flaggedSales: две сделки пары (3,4) помечены; (5,6) — нет (не реципрок, не пинг-понг, не само).
  assert.equal(body.totals.flaggedSales, 2)
})

test("integrity: пинг-понг артефакта (≥3 продаж) — на уровне артефактов", async () => {
  sell(99, 1, 2)
  sell(99, 2, 3)
  sell(99, 3, 1)
  sell(50, 1, 2) // другой артефакт, одна продажа — не пинг-понг
  const body = (await integrity(30)).body.integrity
  assert.equal(body.totals.pingPongArtifacts, 1, "только артефакт 99")
  assert.equal(body.suspects.pingPongArtifacts[0].artifactId, 99)
  assert.equal(body.suspects.pingPongArtifacts[0].sales, 3)
  // 3 продажи артефакта 99 помечены как flagged (пинг-понг), 4-я (арт 50) — нет.
  assert.equal(body.totals.flaggedSales, 3)
})

test("integrity: само-кросс ордербука (buyer=seller в tc_trades)", async () => {
  trade(5, 5) // само-кросс
  trade(5, 6) // честная
  trade(null, 6) // неполная (null) — не считаем
  const t = (await integrity(30)).body.integrity.totals
  assert.equal(t.selfCrossTrades, 1)
})

test("integrity: shill-ставка (продавец бидует свой аукцион)", async () => {
  auction(1, 100) // продавец 100
  auction(2, 200)
  bid(1, 100) // shill: сам продавец
  bid(1, 101) // честная
  bid(2, 202) // честная
  const t = (await integrity(30)).body.integrity.totals
  assert.equal(t.shillBids, 1)
})

test("integrity: окно days отсекает старые события по всем векторам", async () => {
  const old = Date.now() - 40 * DAY_MS
  sell(1, 7, 7, { soldAt: old }) // само-сделка вне 30д
  trade(5, 5, old) // само-кросс вне 30д
  auction(1, 100)
  bid(1, 100, old) // shill вне 30д
  const t30 = (await integrity(30)).body.integrity.totals
  assert.equal(t30.selfDeals, 0, "старая само-сделка вне окна")
  assert.equal(t30.selfCrossTrades, 0)
  assert.equal(t30.shillBids, 0)
  const t365 = (await integrity(365)).body.integrity.totals
  assert.equal(t365.selfDeals, 1, "days=365 видит старое")
  assert.equal(t365.selfCrossTrades, 1)
  assert.equal(t365.shillBids, 1)
})

test("integrity: flaggedSales не двоит продажу, помеченную несколькими сигналами", async () => {
  // Артефакт 99 пинг-понг (3×) И одна из его сделок — реципрокная пара (1,2).
  sell(99, 1, 2)
  sell(99, 2, 1) // реципрок с первой + вклад в пинг-понг
  sell(99, 3, 1) // третья продажа → пинг-понг активен
  const t = (await integrity(30)).body.integrity.totals
  assert.equal(t.pingPongArtifacts, 1)
  assert.equal(t.reciprocalPairs, 1)
  // Все 3 продажи одного артефакта помечены ровно по разу (COUNT сделок, без двойного счёта).
  assert.equal(t.flaggedSales, 3)
  assert.equal(t.washTradingRate, 1)
})

test("integrity: days клампится в [1,365] (семантика как в growth)", async () => {
  // 0 ложно в `parseInt||30` → трактуется как «не задано» → дефолт 30 (как в growth).
  assert.equal((await integrity(0)).body.integrity.days, 30, "0 → дефолт 30")
  assert.equal((await integrity(-5)).body.integrity.days, 1, "отрицательное → нижний клэмп 1")
  assert.equal((await integrity(9999)).body.integrity.days, 365, "9999 → верхний клэмп 365")
  assert.equal((await integrity()).body.integrity.days, 30, "по умолчанию 30")
})
