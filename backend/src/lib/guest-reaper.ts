import { reapStaleGuests } from "./guest-service"

/**
 * Планировщик жатвы брошенных гостей воронки «1 бесплатный проект по IP».
 *
 * Зачем: каждый новый IP на лендинге чеканит строку users(is_guest=1). Гость,
 * который так и не создал проект (bounce) и не зарегистрировался, — вечный мусор.
 * Чистая логика удаления — в lib/guest-service.ts (reapStaleGuests, тестируется
 * против in-memory БД); здесь только расписание (как lib/db-backup.ts).
 *
 * Безопасность: reapStaleGuests несёт полный гвард в самом DELETE — реальные
 * аккаунты, забранных гостей и гостей С проектом не трогает никогда.
 */

const INTERVAL_MS = Math.max(
  60 * 60 * 1000, // не чаще раза в час
  Number(process.env.GUEST_REAP_INTERVAL_MS ?? 6 * 60 * 60 * 1000), // по умолчанию раз в 6ч
)

/**
 * Запускает жатву по расписанию: первый прогон через минуту после старта (миграции
 * к этому моменту прошли) и далее раз в INTERVAL_MS. Интервал .unref() — не держит
 * event loop. В тестах не запускаем (фоновые таймеры текли бы между тест-файлами).
 */
export function scheduleGuestReaper(): void {
  if (process.env.NODE_ENV === "test") return
  if (process.env.GUEST_REAP_DISABLED === "true") return

  const run = () => {
    try {
      const r = reapStaleGuests()
      if (r.deletedGuests > 0) {
        console.log(
          `🧹 guest-reaper: удалено брошенных гостей ${r.deletedGuests} (кошельков ${r.deletedWallets})`,
        )
      }
    } catch (err: any) {
      console.error("[guest-reaper] failed:", err?.message || err)
    }
  }

  setTimeout(run, 60_000).unref()
  setInterval(run, INTERVAL_MS).unref()
}
