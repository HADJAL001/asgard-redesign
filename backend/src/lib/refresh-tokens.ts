import crypto from 'node:crypto';
import db from './db';

/**
 * Сервис stateful refresh-токенов с ротацией и детекцией повторного
 * использования (см. миграцию 068_refresh_tokens).
 *
 * Ключевые свойства:
 *  - Токен — opaque случайная строка; в БД хранится только её SHA-256.
 *  - rotate() атомарно отзывает предъявленный токен и выпускает новый в
 *    той же семье. Атомарность (BEGIN IMMEDIATE + условный UPDATE с
 *    проверкой changes) защищает от гонки двух параллельных refresh с
 *    одним токеном: ровно один выиграет ротацию, второй получит retry.
 *  - Предъявление уже отозванного токена вне grace-окна трактуется как
 *    кража → отзыв всей семьи (revokeFamily).
 */

const TOKEN_BYTES = 48;                          // 384 бита энтропии
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 дней (скользящее окно каждого токена)
/* Абсолютный потолок сессии: даже при регулярной ротации семья не живёт дольше
   этого срока — по истечении требуется полноценный релогин. Ограничивает окно
   эксплуатации украденной, но ещё не задетектированной цепочки. */
const ABSOLUTE_SESSION_MS = Number(process.env.REFRESH_ABSOLUTE_MS ?? 30 * 24 * 60 * 60 * 1000);
/* Grace-окно: короткий интервал после отзыва, в течение которого повторный
   приход того же токена считается безобидной гонкой/ретраем сети, а не
   кражей. Иначе двойной клик или ретрай оффлайн-очереди убивал бы сессию.
   Настраивается через env (тесты выставляют 0, чтобы проверить детекцию reuse). */
const GRACE_PERIOD_MS = Number(process.env.REFRESH_GRACE_MS ?? 60 * 1000);

export type RotateResult =
  | { status: 'ok'; userId: number; refreshToken: string }
  | { status: 'invalid' }   // токен неизвестен
  | { status: 'expired' }   // токен истёк
  | { status: 'retry' }     // отозван, но в grace-окне — клиент может повторить
  | { status: 'reuse' };    // отозван вне grace-окна — детекция кражи, семья убита

interface Row {
  id: number;
  user_id: number;
  token_hash: string;
  family_id: string;
  expires_at: number;
  revoked: number;
  revoked_at: number | null;
}

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Вставка новой строки токена в указанную семью. Возвращает сам токен. */
function insert(userId: number, familyId: string): string {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(userId, hash(token), familyId, Date.now() + REFRESH_TTL_MS);
  return token;
}

export class RefreshTokenService {
  /** Выпускает новый refresh-токен в НОВОЙ семье (вызывается при login/register). */
  static issue(userId: number): string {
    const familyId = crypto.randomBytes(16).toString('hex');
    return insert(userId, familyId);
  }

  /**
   * Ротация: отзывает предъявленный токен и выдаёт новый в той же семье.
   * Атомарно — вся логика под BEGIN IMMEDIATE.
   */
  static rotate(token: string): RotateResult {
    const th = hash(token);

    const runTx = db.transaction((): RotateResult => {
      const row = db
        .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`)
        .get(th) as Row | undefined;

      if (!row) return { status: 'invalid' };

      if (row.revoked) {
        const revokedAt = row.revoked_at ?? 0;
        if (Date.now() - revokedAt < GRACE_PERIOD_MS) {
          return { status: 'retry' };
        }
        // Повторное использование отозванного токена вне grace-окна → кража.
        db.prepare(
          `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?
           WHERE family_id = ? AND revoked = 0`,
        ).run(Date.now(), row.family_id);
        return { status: 'reuse' };
      }

      if (row.expires_at < Date.now()) {
        return { status: 'expired' };
      }

      // Абсолютный потолок сессии: возраст семьи считаем по самому раннему
      // токену цепочки. Старше лимита — принудительный релогин (отзываем семью).
      const birth = db
        .prepare(`SELECT MIN(created_at) AS m FROM refresh_tokens WHERE family_id = ?`)
        .get(row.family_id) as { m: number | null };
      if (birth?.m && Date.now() - birth.m > ABSOLUTE_SESSION_MS) {
        db.prepare(
          `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?
           WHERE family_id = ? AND revoked = 0`,
        ).run(Date.now(), row.family_id);
        return { status: 'expired' };
      }

      // Условный отзыв: если строку уже отозвал параллельный refresh
      // (changes === 0) — это гонка, отдаём retry, нового токена не плодим.
      const res = db
        .prepare(
          `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?
           WHERE token_hash = ? AND revoked = 0`,
        )
        .run(Date.now(), th);

      if (res.changes === 0) return { status: 'retry' };

      const refreshToken = insert(row.user_id, row.family_id);
      return { status: 'ok', userId: row.user_id, refreshToken };
    });

    // BEGIN IMMEDIATE — эксклюзивная блокировка записи на время ротации.
    return runTx.immediate();
  }

  /** Отзывает конкретный токен (одну сессию). Idempotent. */
  static revoke(token: string): void {
    db.prepare(
      `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?
       WHERE token_hash = ? AND revoked = 0`,
    ).run(Date.now(), hash(token));
  }

  /** Отзывает всю семью по её id (например, при детекции кражи вручную). */
  static revokeFamily(familyId: string): void {
    db.prepare(
      `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?
       WHERE family_id = ? AND revoked = 0`,
    ).run(Date.now(), familyId);
  }

  /** Глобальный выход: отзывает все живые токены пользователя. */
  static revokeAllForUser(userId: number): void {
    db.prepare(
      `UPDATE refresh_tokens SET revoked = 1, revoked_at = ?
       WHERE user_id = ? AND revoked = 0`,
    ).run(Date.now(), userId);
  }

  /** Уборка истёкших/давно отозванных строк (можно звать по расписанию). */
  static purgeExpired(olderThanMs = REFRESH_TTL_MS): number {
    const res = db
      .prepare(
        `DELETE FROM refresh_tokens
         WHERE expires_at < ? OR (revoked = 1 AND revoked_at < ?)`,
      )
      .run(Date.now(), Date.now() - olderThanMs);
    return res.changes;
  }
}
