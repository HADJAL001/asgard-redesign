import db from "./db"
import { todayNumber } from "./daily-streak"
import { sendExpoPush, ExpoPushMessage } from "./push-sender"

/**
 * Push-напоминания о daily-стрике. Цель — узкий сегмент «под угрозой»:
 * пользователь забирал награду ВЧЕРА (last_claim_day === today-1), но ещё не
 * сегодня. Его серия жива, но сгорит без сегодняшнего захода — это единственные,
 * кого осмысленно тормошить. Кто забрал сегодня — не трогаем; у кого серия уже
 * прервалась (last_claim_day < today-1) — напоминание бессмысленно.
 */

interface Recipient {
  token: string
  streak: number
}

export function findStreakReminderRecipients(today = todayNumber()): Recipient[] {
  return db
    .prepare(
      `SELECT pt.token AS token, u.daily_streak AS streak
       FROM users u
       JOIN push_tokens pt ON pt.user_id = u.id AND pt.enabled = 1
       WHERE u.last_claim_day = ?`,
    )
    .all(today - 1) as Recipient[]
}

function pluralDays(n: number): string {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return "день"
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "дня"
  return "дней"
}

export function buildStreakReminders(today = todayNumber()): ExpoPushMessage[] {
  return findStreakReminderRecipients(today).map((r) => ({
    to: r.token,
    title: "🔥 Серия под угрозой",
    body: `У тебя серия ${r.streak} ${pluralDays(r.streak)} — забери награду сегодня, чтобы не потерять!`,
    data: { type: "streak_reminder" },
    sound: "default",
  }))
}

/** Собирает и рассылает напоминания. Возвращает число отправленных. Best-effort. */
export async function runStreakReminders(today = todayNumber()): Promise<number> {
  const messages = buildStreakReminders(today)
  const sent = await sendExpoPush(messages)
  if (sent > 0) console.log(`[push] streak reminders sent: ${sent}`)
  return sent
}
