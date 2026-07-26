import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 091: инженерный вердикт проекта
   ----------------------------------------------------------------
   До этой миграции у проекта не было ни одного честного признака
   работоспособности. Джоб генерации ставил `status = 'ready'` сразу
   после записи файлов, а результат единственной проверки
   (`ts.transpileModule` — синтаксис одного файла в отрыве от
   остальных) складывался в `generation_error` и НИКАК не влиял на
   статус: проект с битыми импортами объявлялся готовым.

   Теперь генерация проходит инженерный контур (lib/project-engineering.ts):
   разбор целостности → механический ремонт → AI-ремонт → повторный
   разбор → опционально реальная сборка в песочнице. Результат обязан
   храниться: пользователь имеет право знать, ЧЕМ доказана
   работоспособность его приложения, а платформа — уметь повторить
   ремонт позже (POST /projects/:id/repair).

   Три аддитивные колонки в `projects`:

   1. build_status TEXT (nullable) — вердикт:
        'passed'     чисто с первого разбора;
        'repaired'   дефекты были и починены, финальный разбор чист;
        'broken'     дефекты остались (проект доступен, но честно помечен);
        'unverified' разбор невозможен (нет TypeScript в рантайме).
   2. build_report TEXT (nullable) — JSON отчёта: проверки, остаточные
      дефекты, журнал ремонта, чем доказано (static/sandbox), лог сборки.
      Вердикт производен от отчёта — разойтись они не могут (приём 081/090).
   3. build_verified_at INTEGER (nullable) — когда контур отработал.

   Grandfather: существующие проекты остаются с NULL. Backfill НЕ делаем —
   приписать старому проекту вердикт, которого никто не выносил, значило
   бы соврать. Фронт для NULL показывает «инженерная проверка не
   проводилась» и предлагает запустить её вручную.

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 081/090).
   ================================================================ */

export function runEngineeringContourMigration() {
  const projectsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()
  if (!projectsExists) return

  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("build_status")) {
    db.exec(`ALTER TABLE projects ADD COLUMN build_status TEXT`)
    console.log("✅ Migration 091: added projects.build_status")
  }
  if (!cols.includes("build_report")) {
    db.exec(`ALTER TABLE projects ADD COLUMN build_report TEXT`)
    console.log("✅ Migration 091: added projects.build_report")
  }
  if (!cols.includes("build_verified_at")) {
    db.exec(`ALTER TABLE projects ADD COLUMN build_verified_at INTEGER`)
    console.log("✅ Migration 091: added projects.build_verified_at")
  }

  console.log("✅ Migration 091: Engineering contour ready (legacy projects grandfathered)")
}

runEngineeringContourMigration()
