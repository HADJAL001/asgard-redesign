import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Юнит-тесты серверной аналитики роста (lib/analytics.ts).
   In-memory БД; DB_PATH=:memory: до динамического импорта lib/db
   (обычный import хойстится выше присваивания env).
   Проверяем инвариант: track() пишет событие, синтезирует session_id
   для серверных событий, обрезает переразмеренный meta и НИКОГДА не
   бросает — потеря события дешевле упавшего логина/регистрации.
   ================================================================ */

let db: any;
let analytics: typeof import('../lib/analytics');

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  // Схема совпадает с миграцией 066_analytics_events (session_id NOT NULL).
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  analytics = await import('../lib/analytics');
});

beforeEach(() => {
  db.exec('DELETE FROM analytics_events;');
});

const rows = () =>
  db.prepare('SELECT * FROM analytics_events ORDER BY id').all() as any[];

test('track: пишет событие с user_id и синтезирует srv:u<id>', () => {
  analytics.track(analytics.GrowthEvent.Register, { userId: 42, meta: { referred: true } });
  const r = rows();
  assert.equal(r.length, 1);
  assert.equal(r[0].event_name, 'register');
  assert.equal(r[0].user_id, 42);
  assert.equal(r[0].session_id, 'srv:u42');
  assert.equal(JSON.parse(r[0].meta).referred, true);
});

test('track: гостевое событие (без userId) → user_id NULL, session srv:anon', () => {
  analytics.track(analytics.GrowthEvent.ShareView, { meta: { artifactId: 7 } });
  const r = rows();
  assert.equal(r.length, 1);
  assert.equal(r[0].event_name, 'artifact_share_view');
  assert.equal(r[0].user_id, null);
  assert.equal(r[0].session_id, 'srv:anon');
});

test('track: переданный sessionId имеет приоритет над синтезированным', () => {
  analytics.track(analytics.GrowthEvent.Login, { userId: 5, sessionId: 'client-abc' });
  assert.equal(rows()[0].session_id, 'client-abc');
});

test('track: json_extract meta.referred = 1 для JSON-true (контракт growth-воронки)', () => {
  analytics.track(analytics.GrowthEvent.Register, { userId: 1, meta: { referred: true } });
  analytics.track(analytics.GrowthEvent.Register, { userId: 2, meta: { referred: false } });
  const referred = db
    .prepare(`SELECT COUNT(*) as c FROM analytics_events WHERE event_name='register' AND json_extract(meta,'$.referred') = 1`)
    .get() as { c: number };
  assert.equal(referred.c, 1);
});

test('track: переразмеренный meta обрезается до 2 КБ, не роняя запись', () => {
  analytics.track('register', { userId: 1, meta: { blob: 'x'.repeat(5000) } });
  const r = rows();
  assert.equal(r.length, 1);
  assert.ok(r[0].meta.length <= 2000, `meta длиной ${r[0].meta.length} должна быть ≤ 2000`);
});

test('track: без meta пишет NULL', () => {
  analytics.track(analytics.GrowthEvent.Login, { userId: 9 });
  assert.equal(rows()[0].meta, null);
});

test('track: НИКОГДА не бросает — даже если meta не сериализуем (циклическая ссылка)', () => {
  const cyclic: any = {};
  cyclic.self = cyclic;
  // JSON.stringify бросил бы — track обязан проглотить и не уронить вызывающий запрос.
  assert.doesNotThrow(() => analytics.track('login', { userId: 1, meta: cyclic }));
});
