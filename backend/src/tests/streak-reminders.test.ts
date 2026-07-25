import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Юнит-тесты выборки push-напоминаний о стрике.
   Проверяем ТОЛЬКО логику выборки/сообщений (без реальной отправки в Expo).
   ================================================================ */

let db: any;
let svc: typeof import('../lib/streak-reminders');

const T = 20_000;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, daily_streak INTEGER NOT NULL DEFAULT 0, last_claim_day INTEGER
    );
    CREATE TABLE IF NOT EXISTS push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT NOT NULL,
      platform TEXT, enabled INTEGER NOT NULL DEFAULT 1
    );
  `);
  svc = await import('../lib/streak-reminders');
});

beforeEach(() => {
  db.exec('DELETE FROM users; DELETE FROM push_tokens;');
});

function user(id: number, streak: number, lastClaimDay: number | null) {
  db.prepare('INSERT INTO users (id, daily_streak, last_claim_day) VALUES (?, ?, ?)').run(id, streak, lastClaimDay);
}
function tokenFor(userId: number, token: string, enabled = 1) {
  db.prepare('INSERT INTO push_tokens (user_id, token, enabled) VALUES (?, ?, ?)').run(userId, token, enabled);
}

test('выбирает только «под угрозой»: забрал ВЧЕРА, не сегодня, с включённым токеном', () => {
  user(1, 3, T - 1); tokenFor(1, 'tok1');       // под угрозой → включён
  user(2, 5, T);     tokenFor(2, 'tok2');       // забрал сегодня → нет
  user(3, 2, T - 2); tokenFor(3, 'tok3');       // серия уже прервалась → нет
  user(4, 4, T - 1); tokenFor(4, 'tok4', 0);    // токен выключен → нет
  user(5, 6, T - 1);                             // нет токена → нет

  const recipients = svc.findStreakReminderRecipients(T);
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].token, 'tok1');
  assert.equal(recipients[0].streak, 3);
});

test('buildStreakReminders: корректное сообщение и склонение', () => {
  user(1, 3, T - 1); tokenFor(1, 'tok1');
  const msgs = svc.buildStreakReminders(T);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].to, 'tok1');
  assert.match(msgs[0].body!, /серия 3 дня/);
  assert.equal((msgs[0].data as any).type, 'streak_reminder');
});

test('склонение: 1 день / 5 дней', () => {
  user(1, 1, T - 1); tokenFor(1, 'a');
  user(2, 5, T - 1); tokenFor(2, 'b');
  const bodies = svc.buildStreakReminders(T).map((m) => m.body);
  assert.ok(bodies.some((b) => /серия 1 день/.test(b!)));
  assert.ok(bodies.some((b) => /серия 5 дней/.test(b!)));
});

test('нет «под угрозой» → пустой список', () => {
  user(1, 2, T);      tokenFor(1, 'x');  // забрал сегодня
  assert.equal(svc.buildStreakReminders(T).length, 0);
});
