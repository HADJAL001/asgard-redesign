import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 090: дизайн-система сгенерированного приложения
   ----------------------------------------------------------------
   До этой миграции у проекта не сохранялось НИЧЕГО о его облике —
   да и облика по сути не было: `app-generator.ts` отдавал приложению
   `tailwind.config.ts` с пустым `theme: { extend: {} }` и `globals.css`
   из трёх строк `@tailwind`. Дизайн-системы не существовало, поэтому
   и хранить было нечего.

   Теперь генерация начинается с дизайн-брифа (lib/design-system.ts):
   архетип, палитра с ГАРАНТИРОВАННЫМ контрастом WCAG, типографическая
   шкала, ритм отступов, движение. Бриф — это не украшение, а контракт,
   которому подчиняются все параллельно генерируемые файлы. Его нужно
   хранить, чтобы (1) витрина проекта показывала, из чего сложился
   облик, и (2) доработки проекта шли в том же визуальном языке, а не
   рождали второе приложение поверх первого.

   Три аддитивные колонки в `projects`:

   1. design_brief  TEXT (nullable) — JSON DesignBrief (палитра, шрифты,
      радиусы, тени, замеренные контрасты).
   2. design_score  INTEGER (nullable) — балл качества интерфейса 0..100
      от lib/design-qa.ts.
   3. design_report TEXT (nullable) — JSON разбора балла: факторы и
      конкретные нарушения. Балл производен от разбора, поэтому храним
      оба — расхождение невозможно по построению (приём из 081/#62).

   Grandfather: существующие проекты остаются с NULL во всех трёх.
   Backfill НЕ делаем — бриф описывает то, как приложение БЫЛО
   сгенерировано; задним числом приписывать старым проектам дизайн-
   систему, которой у них не было, значило бы соврать в витрине.
   Фронт для NULL честно показывает «дизайн-система не записана».

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 081/082).
   ================================================================ */

export function runDesignSystemMigration() {
  const projectsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()
  if (!projectsExists) return

  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("design_brief")) {
    db.exec(`ALTER TABLE projects ADD COLUMN design_brief TEXT`)
    console.log("✅ Migration 090: added projects.design_brief")
  }
  if (!cols.includes("design_score")) {
    db.exec(`ALTER TABLE projects ADD COLUMN design_score INTEGER`)
    console.log("✅ Migration 090: added projects.design_score")
  }
  if (!cols.includes("design_report")) {
    db.exec(`ALTER TABLE projects ADD COLUMN design_report TEXT`)
    console.log("✅ Migration 090: added projects.design_report")
  }

  console.log("✅ Migration 090: Design system ready (legacy projects grandfathered)")
}

runDesignSystemMigration()
