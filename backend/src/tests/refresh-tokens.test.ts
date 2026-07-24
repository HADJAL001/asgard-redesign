import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/* ================================================================
   OSGARD · Юнит-тесты RefreshTokenService (ротация + детекция кражи)
   ----------------------------------------------------------------
   Работаем на изолированной in-memory БД. Критично: DB_PATH выставляем
   ДО динамического импорта lib/db — иначе синглтон подключится к файловой
   БД (обычный `import` хойстится выше присваивания env). dotenv.config()
   в db.ts не перезатирает уже установленный process.env.DB_PATH.
   ================================================================ */

const GRACE_MS = 60 * 1000;

let db: any;
let RefreshTokenService: any;

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** Искусственно «состарить» revoked_at отозванного токена за пределы grace-окна. */
function backdateRevoked(token: string) {
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`)
    .run(Date.now() - GRACE_MS - 1000, sha(token));
}

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  // Минимальная users для FK refresh_tokens.user_id → users(id) (foreign_keys=ON).
  db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY);`);
  db.exec(`INSERT OR IGNORE INTO users (id) VALUES (1),(2);`);
  const mig = await import('../migrations/068_refresh_tokens');
  mig.runRefreshTokensMigration();
  ({ RefreshTokenService } = await import('../lib/refresh-tokens'));
});

beforeEach(() => {
  db.exec('DELETE FROM refresh_tokens');
});

test('1. issue: создаёт строку токена и хранит только хеш', () => {
  const token = RefreshTokenService.issue(1);
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha(token));
  assert.ok(row, 'строка должна существовать');
  assert.equal(row.user_id, 1);
  assert.equal(row.revoked, 0);
  assert.notEqual(row.token_hash, token, 'в БД лежит хеш, не сам токен');
});

test('2. rotate(ok): выдаёт новый токен той же семьи и отзывает старый', () => {
  const t1 = RefreshTokenService.issue(1);
  const familyBefore = db.prepare('SELECT family_id FROM refresh_tokens WHERE token_hash = ?').get(sha(t1)).family_id;

  const r = RefreshTokenService.rotate(t1);
  assert.equal(r.status, 'ok');
  assert.equal(r.userId, 1);
  assert.ok(r.refreshToken && r.refreshToken !== t1);

  const oldRow = db.prepare('SELECT revoked FROM refresh_tokens WHERE token_hash = ?').get(sha(t1));
  assert.equal(oldRow.revoked, 1, 'старый токен отозван');

  const newRow = db.prepare('SELECT family_id, revoked FROM refresh_tokens WHERE token_hash = ?').get(sha(r.refreshToken));
  assert.equal(newRow.family_id, familyBefore, 'новый токен в той же семье');
  assert.equal(newRow.revoked, 0);
});

test('3. rotate(retry): повторная ротация старого токена в grace-окне', () => {
  const t1 = RefreshTokenService.issue(1);
  RefreshTokenService.rotate(t1);            // t1 отозван только что (revoked_at ≈ now)
  const again = RefreshTokenService.rotate(t1);
  assert.equal(again.status, 'retry', 'в grace-окне — безопасный retry, не убиваем семью');
});

test('4. rotate(reuse): использование отозванного токена вне grace → детекция кражи', () => {
  const t1 = RefreshTokenService.issue(1);
  const r = RefreshTokenService.rotate(t1);   // t1 → t2
  backdateRevoked(t1);                         // выносим отзыв за grace-окно
  const attack = RefreshTokenService.rotate(t1);
  assert.equal(attack.status, 'reuse');

  // Вся семья должна быть отозвана, включая живой t2.
  const t2Row = db.prepare('SELECT revoked FROM refresh_tokens WHERE token_hash = ?').get(sha(r.refreshToken));
  assert.equal(t2Row.revoked, 1, 'семья убита — t2 тоже отозван');
});

test('5. rotate(invalid): неизвестный токен', () => {
  const r = RefreshTokenService.rotate('deadbeef-not-a-real-token');
  assert.equal(r.status, 'invalid');
});

test('6. rotate(expired): истёкший токен', () => {
  const t1 = RefreshTokenService.issue(1);
  db.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?').run(Date.now() - 1000, sha(t1));
  const r = RefreshTokenService.rotate(t1);
  assert.equal(r.status, 'expired');
});

test('7. revoke: отозванный токен вне grace → reuse (сессия закрыта)', () => {
  const t1 = RefreshTokenService.issue(1);
  RefreshTokenService.revoke(t1);
  backdateRevoked(t1);
  const r = RefreshTokenService.rotate(t1);
  assert.equal(r.status, 'reuse');
});

test('8. revokeAllForUser: глобальный выход отзывает все живые токены юзера', () => {
  const a = RefreshTokenService.issue(1);
  const b = RefreshTokenService.issue(1);
  const other = RefreshTokenService.issue(2);

  RefreshTokenService.revokeAllForUser(1);

  assert.equal(db.prepare('SELECT revoked FROM refresh_tokens WHERE token_hash = ?').get(sha(a)).revoked, 1);
  assert.equal(db.prepare('SELECT revoked FROM refresh_tokens WHERE token_hash = ?').get(sha(b)).revoked, 1);
  assert.equal(db.prepare('SELECT revoked FROM refresh_tokens WHERE token_hash = ?').get(sha(other)).revoked, 0, 'чужой юзер не затронут');
});
