import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { computeCreatorRoyalty, CREATOR_ROYALTY_SHARE_OF_FEE } from '../lib/creator-royalty';

/* ================================================================
   OSGARD · Провенанс и роялти творца (миграция 080 + lib/creator-royalty).
   Часть 1 — чистая логика роялти (без БД).
   Часть 2 — in-memory проверка триггера провенанса и честного backfill:
   DB_PATH=:memory: до динамического импорта lib/db, затем импорт самой
   миграции (самовызов прогоняет ALTER+триггер+backfill против готовой схемы).
   ================================================================ */

/* ---------------- Часть 1: чистая логика роялти ---------------- */

test('роялти: сторонний творец получает долю комиссии', () => {
  const r = computeCreatorRoyalty(100, { creatorId: 7, sellerId: 2, buyerId: 3 });
  assert.equal(r?.creatorId, 7);
  assert.equal(r?.amount, 100 * CREATOR_ROYALTY_SHARE_OF_FEE);
});

test('роялти: творец == продавец → нет самонакрутки', () => {
  assert.equal(computeCreatorRoyalty(100, { creatorId: 2, sellerId: 2, buyerId: 3 }), null);
});

test('роялти: творец == покупатель → нет выкупа собственной ковки', () => {
  assert.equal(computeCreatorRoyalty(100, { creatorId: 3, sellerId: 2, buyerId: 3 }), null);
});

test('роялти: нет творца (NULL creator_id) → null', () => {
  assert.equal(computeCreatorRoyalty(100, { creatorId: null, sellerId: 2, buyerId: 3 }), null);
});

test('роялти: нулевая/отрицательная комиссия → null', () => {
  assert.equal(computeCreatorRoyalty(0, { creatorId: 7, sellerId: 2, buyerId: 3 }), null);
  assert.equal(computeCreatorRoyalty(-5, { creatorId: 7, sellerId: 2, buyerId: 3 }), null);
});

test('anti-wash: роялти строго меньше комиссии (круговая перепродажа убыточна)', () => {
  const fee = 100;
  const r = computeCreatorRoyalty(fee, { creatorId: 7, sellerId: 2, buyerId: 3 });
  assert.ok((r?.amount ?? 0) < fee, 'роялти должно быть меньше комиссии');
});

/* ---------------- Часть 2: миграция-триггер провенанса ---------------- */

let db: any;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY);`);
  db.exec(`
    CREATE TABLE artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'kept'
    );
  `);
  db.exec(`CREATE TABLE marketplace_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, artifact_id INTEGER NOT NULL, status TEXT NOT NULL);`);
  db.exec(`INSERT INTO users (id) VALUES (1),(2),(3);`);

  // Историческая раскладка ДО миграции:
  //   a1 — выкован user1, никогда не продавался → backfill даст creator=1.
  //   a2 — сейчас у user2, но БЫЛ продан (есть sold-листинг) → creator остаётся NULL (честно).
  db.exec(`INSERT INTO artifacts (id, owner_id, name) VALUES (1,1,'Клинок'),(2,2,'Щит');`);
  db.exec(`INSERT INTO marketplace_listings (artifact_id, status) VALUES (2,'sold');`);

  // Схема готова → импорт миграции запускает самовызов против неё (ALTER + триггер + backfill).
  await import('../migrations/080_creator_provenance');
});

test('backfill: неторгованный артефакт получает creator = owner', () => {
  assert.equal(db.prepare(`SELECT creator_id FROM artifacts WHERE id = 1`).get().creator_id, 1);
});

test('backfill: реально проданный артефакт остаётся без creator (честный провенанс)', () => {
  assert.equal(db.prepare(`SELECT creator_id FROM artifacts WHERE id = 2`).get().creator_id, null);
});

test('триггер: новая ковка авто-проставляет creator = owner', () => {
  const info = db.prepare(`INSERT INTO artifacts (owner_id, name) VALUES (3, 'Посох')`).run();
  const a = db.prepare(`SELECT creator_id FROM artifacts WHERE id = ?`).get(info.lastInsertRowid);
  assert.equal(a.creator_id, 3);
});

test('иммутабельность: передача владения (UPDATE owner_id) НЕ меняет creator', () => {
  const info = db.prepare(`INSERT INTO artifacts (owner_id, name) VALUES (1, 'Амулет')`).run();
  db.prepare(`UPDATE artifacts SET owner_id = 2 WHERE id = ?`).run(info.lastInsertRowid);
  const a = db.prepare(`SELECT creator_id, owner_id FROM artifacts WHERE id = ?`).get(info.lastInsertRowid);
  assert.equal(a.creator_id, 1, 'творец неизменен при перепродаже');
  assert.equal(a.owner_id, 2);
});

test('триггер уважает явный creator_id (будущая передача провенанса сквозь фьюжн)', () => {
  const info = db.prepare(`INSERT INTO artifacts (owner_id, name, creator_id) VALUES (2, 'Реликвия', 1)`).run();
  assert.equal(db.prepare(`SELECT creator_id FROM artifacts WHERE id = ?`).get(info.lastInsertRowid).creator_id, 1);
});
