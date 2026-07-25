import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Тесты growth-ридера (AdminController.growth, #48).
   Замыкает петлю роста: проверяем, что дашборд читает ровно те
   события, которые пишет lib/analytics.ts (#46). Сквозной контракт
   write→read: наполняем таблицу через track() (как в проде) + пара
   прямых вставок с заданным created_at, чтобы проверить окно `days`
   и дневной ряд. In-memory БД; DB_PATH=:memory: до импорта lib/db.
   ================================================================ */

const DAY_MS = 86400000;

let db: any;
let analytics: typeof import('../lib/analytics');
let AdminController: typeof import('../controllers/admin.controller').AdminController;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  // Схема = миграция 066_analytics_events.
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
  ({ AdminController } = await import('../controllers/admin.controller'));
});

beforeEach(() => {
  db.exec('DELETE FROM analytics_events;');
});

// Прямая вставка события с явным временем — для проверки окна/ряда.
function insertAt(event: string, createdAt: number, opts: { userId?: number | null; meta?: any } = {}) {
  const userId = opts.userId ?? null;
  const sessionId = userId != null ? `srv:u${userId}` : 'srv:anon';
  db.prepare(
    `INSERT INTO analytics_events (user_id, session_id, event_name, meta, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, sessionId, event, opts.meta != null ? JSON.stringify(opts.meta) : null, createdAt);
}

function mockRes() {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b: any) => {
    r.body = b;
    return r;
  };
  return r;
}

async function growth(days?: number) {
  const req: any = { query: days != null ? { days: String(days) } : {} };
  const res = mockRes();
  await AdminController.growth(req, res);
  return res;
}

test('growth: агрегирует register/login/demo_convert/share_view', async () => {
  analytics.track(analytics.GrowthEvent.Register, { userId: 1, meta: { referred: false } });
  analytics.track(analytics.GrowthEvent.Register, { userId: 2, meta: { referred: true } });
  analytics.track(analytics.GrowthEvent.Login, { userId: 1 });
  analytics.track(analytics.GrowthEvent.DemoConvert, { userId: 1 });
  analytics.track(analytics.GrowthEvent.ShareView, { meta: { artifactId: 7 } });

  const res = await growth(30);
  assert.equal(res.statusCode, 200);
  const t = res.body.growth.totals;
  assert.equal(t.registrations, 2);
  assert.equal(t.logins, 1);
  assert.equal(t.demoConversions, 1);
  assert.equal(t.shareViews, 1);
});

test('growth: referralRate = доля register с meta.referred=true', async () => {
  analytics.track(analytics.GrowthEvent.Register, { userId: 1, meta: { referred: true } });
  analytics.track(analytics.GrowthEvent.Register, { userId: 2, meta: { referred: false } });
  const t = (await growth(30)).body.growth.totals;
  assert.equal(t.registrations, 2);
  assert.equal(t.referredRegistrations, 1);
  assert.equal(t.referralRate, 0.5);
});

test('growth: uniqueLoggedInUsers считает DISTINCT user_id, а logins — все события', async () => {
  analytics.track(analytics.GrowthEvent.Login, { userId: 1 });
  analytics.track(analytics.GrowthEvent.Login, { userId: 1 });
  analytics.track(analytics.GrowthEvent.Login, { userId: 2 });
  const t = (await growth(30)).body.growth.totals;
  assert.equal(t.logins, 3);
  assert.equal(t.uniqueLoggedInUsers, 2);
});

test('growth: uniqueSharedArtifacts считает DISTINCT artifactId', async () => {
  analytics.track(analytics.GrowthEvent.ShareView, { meta: { artifactId: 7 } });
  analytics.track(analytics.GrowthEvent.ShareView, { meta: { artifactId: 7 } });
  analytics.track(analytics.GrowthEvent.ShareView, { meta: { artifactId: 8 } });
  const t = (await growth(30)).body.growth.totals;
  assert.equal(t.shareViews, 3);
  assert.equal(t.uniqueSharedArtifacts, 2);
});

test('growth: окно days отсекает события старше порога', async () => {
  const now = Date.now();
  insertAt('register', now - 5 * DAY_MS, { userId: 1, meta: { referred: false } }); // в окне
  insertAt('register', now - 40 * DAY_MS, { userId: 2, meta: { referred: false } }); // вне 30д

  assert.equal((await growth(30)).body.growth.totals.registrations, 1, 'days=30 видит только свежее');
  assert.equal((await growth(365)).body.growth.totals.registrations, 2, 'days=365 видит оба');
});

test('growth: daily — группировка по дню, свежее сверху', async () => {
  const now = Date.now();
  insertAt('register', now - 1 * DAY_MS, { userId: 1 });
  insertAt('login', now - 2 * DAY_MS, { userId: 1 });
  const daily = (await growth(30)).body.growth.daily;
  assert.ok(daily.length >= 2, 'минимум два дня');
  // DESC: первый день должен быть строго новее второго
  assert.ok(daily[0].day > daily[daily.length - 1].day, 'порядок дней по убыванию');
});

test('growth: пустая таблица — нули, referralRate=0, без деления на ноль', async () => {
  const res = await growth(30);
  assert.equal(res.statusCode, 200);
  const t = res.body.growth.totals;
  assert.equal(t.registrations, 0);
  assert.equal(t.referralRate, 0);
  assert.deepEqual(res.body.growth.daily, []);
});
