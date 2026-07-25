import db from './db';

/**
 * Daily-login-стрик (удержание). Награда — КРЕДИТЫ (мягкая валюта, как в
 * онбординге), не ∞/TC, поэтому не затрагивает резервную эмиссию/экономику.
 *
 * Логика серии:
 *  - забрал вчера (last_claim_day === today-1) → стрик += 1;
 *  - пропуск (или первый раз) → стрик = 1;
 *  - повторный забор в тот же день запрещён (идемпотентно, защита от гонки).
 * Награда растёт по дням серии и упирается в потолок на 7-м дне.
 *
 * `today`/`nowMs` вынесены параметрами ради тестируемости (симуляция «вчера»).
 */

const DAY_MS = 86_400_000;
// Кредиты по дню серии (1..7), день 7+ — плоско максимум.
const REWARDS = [10, 15, 20, 25, 30, 40, 50] as const;

export function rewardForStreak(streak: number): number {
  const idx = Math.min(Math.max(streak, 1) - 1, REWARDS.length - 1);
  return REWARDS[idx];
}

export function todayNumber(nowMs = Date.now()): number {
  return Math.floor(nowMs / DAY_MS);
}

interface UserStreakRow {
  daily_streak: number | null;
  last_claim_day: number | null;
}

export interface DailyStatus {
  streak: number;         // текущая длина серии (до сегодняшнего забора)
  claimedToday: boolean;
  canClaim: boolean;
  todayReward: number;    // сколько дадут, если забрать сейчас
  nextReward: number;     // сколько будет завтра при продолжении серии
}

export function getDailyStatus(userId: number, today = todayNumber()): DailyStatus {
  const row = db
    .prepare(`SELECT daily_streak, last_claim_day FROM users WHERE id = ?`)
    .get(userId) as UserStreakRow | undefined;

  const streak = row?.daily_streak ?? 0;
  const last = row?.last_claim_day ?? null;
  const claimedToday = last === today;

  // Какой будет серия при заборе сейчас (для показа корректной награды).
  const projected = claimedToday ? streak : last === today - 1 ? streak + 1 : 1;

  return {
    streak,
    claimedToday,
    canClaim: !claimedToday,
    todayReward: rewardForStreak(projected),
    nextReward: rewardForStreak(projected + 1),
  };
}

export type ClaimResult =
  | { ok: true; streak: number; reward: number; nextReward: number }
  | { ok: false; reason: 'already_claimed'; streak: number };

/** Атомарный забор ежедневной награды (BEGIN IMMEDIATE + условный UPDATE). */
export function claimDaily(userId: number, today = todayNumber()): ClaimResult {
  const run = db.transaction((): ClaimResult => {
    const row = db
      .prepare(`SELECT daily_streak, last_claim_day FROM users WHERE id = ?`)
      .get(userId) as UserStreakRow | undefined;

    const streak = row?.daily_streak ?? 0;
    const last = row?.last_claim_day ?? null;

    if (last === today) return { ok: false, reason: 'already_claimed', streak };

    const newStreak = last === today - 1 ? streak + 1 : 1;

    // Условный апдейт: если параллельный запрос уже забрал сегодня (changes===0) —
    // это гонка двойного клейма, отдаём already_claimed, награду не дублируем.
    const upd = db
      .prepare(
        `UPDATE users SET daily_streak = ?, last_claim_day = ?
         WHERE id = ? AND (last_claim_day IS NULL OR last_claim_day <> ?)`,
      )
      .run(newStreak, today, userId, today);
    if (upd.changes !== 1) return { ok: false, reason: 'already_claimed', streak };

    const reward = rewardForStreak(newStreak);
    db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`)
      .run(reward, Date.now(), userId);

    return { ok: true, streak: newStreak, reward, nextReward: rewardForStreak(newStreak + 1) };
  });

  return run.immediate();
}
