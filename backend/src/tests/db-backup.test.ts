import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

/* ================================================================
   OSGARD · Тесты онлайн-бэкапов SQLite (lib/db-backup)
   ----------------------------------------------------------------
   Работаем на временном файле-БД. Env (DB_PATH/BACKUP_DIR/RETENTION)
   выставляем ДО динамического импорта db/db-backup, т.к. оба читают
   его на этапе загрузки модуля.
   ================================================================ */

let TMP: string;
let db: any;
let backupNow: () => Promise<string>;
let verifyBackup: (path: string, expectedTables?: string[]) => { ok: true; tables: number; bytes: number };

before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'osgard-bk-'));
  process.env.DB_PATH = path.join(TMP, 'src.db');
  process.env.BACKUP_DIR = path.join(TMP, 'backups');
  process.env.BACKUP_RETENTION = '2';

  ({ default: db } = await import('../lib/db'));
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');
  db.prepare('INSERT INTO t (v) VALUES (?)').run('hello');

  ({ backupNow, verifyBackup } = await import('../lib/db-backup'));
});

after(() => {
  try {
    db?.close();
  } catch {
    /* уже закрыта */
  }
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* временная папка могла остаться залоченной на Windows — не критично */
  }
});

test('backupNow: создаёт валидный снимок с данными оригинала', async () => {
  const dest = await backupNow();
  assert.ok(fs.existsSync(dest), 'файл бэкапа должен существовать');
  assert.match(dest, /osgard-.*\.db$/);

  // Бэкап — полноценная SQLite-БД: открываем и читаем строку.
  const bk = new Database(dest, { readonly: true });
  const row = bk.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
  bk.close();
  assert.equal(row.v, 'hello', 'данные оригинала должны быть в бэкапе');
  const verification = verifyBackup(dest, ['t']);
  assert.equal(verification.ok, true);
  assert.ok(verification.bytes > 0);
});

test('verifyBackup: rejects a corrupt snapshot', () => {
  const corrupt = path.join(TMP, 'corrupt.db');
  fs.writeFileSync(corrupt, 'not a sqlite database');
  assert.throws(() => verifyBackup(corrupt), /database|integrity|encrypted/i);
});

test('retention: старые бэкапы удаляются, остаётся не больше N', async () => {
  const dir = process.env.BACKUP_DIR!;
  // Подкладываем «старые» бэкапы с датами, которые сортируются раньше текущих.
  for (const d of ['2020-01-01T00-00-01', '2020-01-01T00-00-02', '2020-01-01T00-00-03']) {
    fs.writeFileSync(path.join(dir, `osgard-${d}.db`), '');
  }

  await backupNow(); // добавляет свежий и подчищает до RETENTION=2

  const files = fs.readdirSync(dir).filter((f) => f.startsWith('osgard-') && f.endsWith('.db'));
  assert.equal(files.length, 2, 'должно остаться ровно RETENTION=2 бэкапа');
  // Самые старые (2020) должны быть удалены — остаются новейшие.
  assert.ok(!files.some((f) => f.includes('2020-01-01T00-00-01')), 'старейший бэкап удалён');
});
