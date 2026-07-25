import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Юнит-тесты daily-login-стрика.
   In-memory БД; DB_PATH=:memory: до динамического импорта lib/db
   (обычный import хойстится выше присваивания env).
   ================================================================ */

let db: any;
let svc: typeof import('../lib/daily-streak');

const T = 20_000; // произвольный «сегодня» (номер дня)

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, daily_streak INTEGER NOT NULL DEFAULT 0, last_claim_day INTEGER
    );
    CREATE TABLE IF NOT EXISTS wallets (
      user_id INTEGER PRIMARY KEY, credits INTEGER NOT NULL DEFAULT 0, updated_at INTEGER
    );
  `);
  svc = await import('../lib/daily-streak');
});

beforeEach(() => {
  db.exec('DELETE FROM users; DELETE FROM wallets;');
  db.prepare('INSERT INTO users (id, daily_streak, last_claim_day) VALUES (1, 0, NULL)').run();
  db.prepare('INSERT INTO wallets (user_id, credits) VALUES (1, 0)').run();
});

const credits = () => db.prepare('SELECT credits FROM wallets WHERE user_id = 1').get().credits as number;

test('rewardForStreak: растёт и упирается в потолок на 7-м дне', () => {
  assert.equal(svc.rewardForStreak(1), 10);
  assert.equal(svc.rewardForStreak(2), 15);
  assert.equal(svc.rewardForStreak(7), 50);
  assert.equal(svc.rewardForStreak(8), 50);   // потолок
  assert.equal(svc.rewardForStreak(0), 10);    // защита от <1
});

test('первый забор: стрик=1, +10 кредитов', () => {
  const r = svc.claimDaily(1, T);
  assert.deepEqual([r.ok, (r as any).streak, (r as any).reward], [true, 1, 10]);
  assert.equal(credits(), 10);
});

test('повторный забор в тот же день запрещён, кредиты не дублируются', () => {
  svc.claimDaily(1, T);
  const again = svc.claimDaily(1, T);
  assert.equal(again.ok, false);
  assert.equal((again as any).reason, 'already_claimed');
  assert.equal(credits(), 10);
});

test('забор на следующий день продолжает серию: стрик=2, +15', () => {
  svc.claimDaily(1, T);
  const r = svc.claimDaily(1, T + 1);
  assert.deepEqual([(r as any).streak, (r as any).reward], [2, 15]);
  assert.equal(credits(), 25);
});

test('пропуск дня сбрасывает серию в 1', () => {
  svc.claimDaily(1, T);            // стрик 1
  svc.claimDaily(1, T + 1);        // стрик 2
  const r = svc.claimDaily(1, T + 3); // пропущен T+2
  assert.equal((r as any).streak, 1);
  assert.equal((r as any).reward, 10);
});

test('getDailyStatus отражает забор сегодня', () => {
  const before = svc.getDailyStatus(1, T);
  assert.deepEqual([before.canClaim, before.claimedToday, before.todayReward], [true, false, 10]);
  svc.claimDaily(1, T);
  const after = svc.getDailyStatus(1, T);
  assert.deepEqual([after.canClaim, after.claimedToday, after.streak], [false, true, 1]);
});
