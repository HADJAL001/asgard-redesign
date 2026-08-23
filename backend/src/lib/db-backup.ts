import fs from 'node:fs';
import path from 'node:path';
import db from './db';
import Database from 'better-sqlite3';

/**
 * Автоматические онлайн-бэкапы SQLite-БД.
 *
 * Зачем: вся экономика (кошельки TC/∞, транзакции, маркетплейс, платежи) живёт
 * в одном SQLite-файле. Даже на персистентном томе Railway остаётся риск порчи
 * данных (сбойная миграция, случайное удаление, повреждение файла). Онлайн-бэкап
 * (`better-sqlite3` .backup() — консистентный снимок без остановки записи) даёт
 * point-in-time recovery.
 *
 * ⚠️ ВАЖНО: BACKUP_DIR обязан указывать на ДОЛГОВЕЧНОЕ хранилище (персистентный
 * том Railway или внешний бакет). Бэкап на той же эфемерной ФС, что и контейнер,
 * исчезнет при редеплое вместе с оригиналом и смысла не имеет.
 */

const BACKUP_DIR = process.env.BACKUP_DIR || './data/backups';
const RETENTION = Math.max(1, Number(process.env.BACKUP_RETENTION ?? 7));
const INTERVAL_MS = Math.max(
  60 * 60 * 1000, // не чаще раза в час
  Number(process.env.BACKUP_INTERVAL_MS ?? 24 * 60 * 60 * 1000), // по умолчанию раз в сутки
);
const PREFIX = 'osgard-';

/** ISO-таймстамп, безопасный для имени файла (без двоеточий — иначе ломается на Windows). */
function stamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace('.', '-').replace('Z', '');
}

export function verifyBackup(filePath: string, expectedTables?: string[]): { ok: true; tables: number; bytes: number } {
  const stat = fs.statSync(filePath)
  if (stat.size <= 0) throw new Error('Backup file is empty')
  const snapshot = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = snapshot.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      throw new Error(`Backup integrity check failed: ${JSON.stringify(integrity)}`)
    }
    const tables = snapshot.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    ).all() as Array<{ name: string }>
    if (expectedTables) {
      const actual = new Set(tables.map((row) => row.name))
      const missing = expectedTables.filter((name) => !actual.has(name))
      if (missing.length > 0) throw new Error(`Backup is missing tables: ${missing.join(', ')}`)
    }
    return { ok: true, tables: tables.length, bytes: stat.size }
  } finally {
    snapshot.close()
  }
}

/** Оставляет только N последних бэкапов, удаляя старые. Имена ISO-отсортированы лексикографически = хронологически. */
function pruneOld(): void {
  let files: string[];
  try {
    files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'));
  } catch {
    return;
  }
  files.sort(); // старые первыми
  const excess = files.length - RETENTION;
  for (let i = 0; i < excess; i++) {
    try {
      fs.rmSync(path.join(BACKUP_DIR, files[i]));
    } catch {
      /* файл мог быть удалён параллельно — игнорируем */
    }
  }
}

/** Делает один консистентный бэкап БД и подчищает старые. Возвращает путь к файлу. */
export async function backupNow(): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, `${PREFIX}${stamp()}.db`);
  const expectedTables = (db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  ).all() as Array<{ name: string }>).map((row) => row.name)
  // better-sqlite3: онлайн-бэкап, консистентный снимок без блокировки записей.
  await db.backup(dest);
  verifyBackup(dest, expectedTables)
  pruneOld();
  return dest;
}

/**
 * Запускает бэкапы по расписанию: один при старте (с небольшой задержкой, чтобы
 * не мешать прогону миграций) и далее раз в INTERVAL_MS. Интервал .unref() —
 * не держит event loop. В тестах не запускаем (фоновые таймеры текли бы между
 * тест-файлами).
 */
export function scheduleBackups(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.BACKUP_DISABLED === 'true') return;

  const run = () => {
    backupNow()
      .then((dest) => console.log(`🗄️  DB backup → ${dest}`))
      .catch((err) => console.error('[db-backup] failed:', err?.message || err));
  };

  // Стартовый бэкап через 30с после подъёма (миграции к этому моменту уже прошли).
  setTimeout(run, 30_000).unref();
  setInterval(run, INTERVAL_MS).unref();

  if (!process.env.BACKUP_DIR) {
    console.warn(
      '[db-backup] BACKUP_DIR не задан — бэкапы пишутся в ./data/backups. ' +
        'Убедись, что это персистентный том Railway, иначе бэкапы исчезнут при редеплое.',
    );
  }
}
