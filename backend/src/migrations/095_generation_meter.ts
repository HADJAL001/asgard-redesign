import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 095: счётчик расхода генерации
   ----------------------------------------------------------------
   Что было: проект знал, ЧТО у него получилось (091 — инженерный
   вердикт), но не знал, ВО ЧТО это обошлось. Сколько раз платформа
   ходила к моделям, сколько токенов сожгла, сколько человек ждал —
   не сохранялось нигде. Пользователь видел спиннер и итог, между
   ними — чёрный ящик.

   Это ровно та претензия, которая на рынке AI-сборщиков приложений
   звучит громче всех: расход кредитов непредсказуем и выясняется
   постфактум. Мы закрываем её честным чеком: расход виден в реальном
   времени и остаётся в истории проекта.

   Шесть аддитивных колонок в `projects`:

   1. gen_ai_calls INTEGER   — сколько обращений к моделям (все попытки,
                               включая неуспешные: они тоже стоили времени).
   2. gen_tokens_in INTEGER  — токенов отправлено.
   3. gen_tokens_out INTEGER — токенов получено.
   4. gen_duration_ms INTEGER— полное время генерации (не сумма вызовов:
                               включает проверки, ремонт и запись файлов).
   5. gen_first_try INTEGER  — 1, если приложение заработало БЕЗ единого
                               ремонта (вердикт passed и ноль починок);
                               0, если пришлось чинить. NULL для старых.
   6. gen_meter TEXT         — JSON-подробности: разбивка по провайдерам,
                               сколько вызовов не отдали usage (оговорка
                               к точности), число раундов ремонта.

   Grandfather: старые проекты остаются с NULL. Backfill невозможен —
   расход этих генераций никто не измерял, и выдумывать числа значило бы
   соврать ровно в том месте, ради честности которого миграция и делается.
   Фронт для NULL показывает «расход не измерялся», а не «0 токенов».

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 091).
   ================================================================ */

export function runGenerationMeterMigration() {
  const projectsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()
  if (!projectsExists) return

  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  const additions: Array<[string, string]> = [
    ["gen_ai_calls", "INTEGER"],
    ["gen_tokens_in", "INTEGER"],
    ["gen_tokens_out", "INTEGER"],
    ["gen_duration_ms", "INTEGER"],
    ["gen_first_try", "INTEGER"],
    ["gen_meter", "TEXT"],
  ]

  for (const [name, type] of additions) {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${type}`)
      console.log(`✅ Migration 095: added projects.${name}`)
    }
  }

  console.log("✅ Migration 095: Generation meter ready (legacy projects grandfathered)")
}

runGenerationMeterMigration()
