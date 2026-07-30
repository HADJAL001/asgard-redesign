import db from "../lib/db"
import { classifyProduct } from "../lib/product-class"

/* ================================================================
   OSGARD · Миграция 101: класс продукта у генерации (волна 7, п.4)
   ----------------------------------------------------------------
   ПРОБЛЕМА, КОТОРУЮ ЗАКРЫВАЕМ. До кодогенерации платформа знала о
   заявке ровно одно — ТЕМУ по словарю из восьми настроений
   (`detectTheme`). Из строки проекта нельзя было узнать, что человека
   просили построить: магазин, чат, панель показателей. Поэтому на
   вопрос «на что это похоже из прошлых генераций и чем те кончились»
   ответить было НЕЧЕМ: похожесть по теме склеивает магазин с чатом,
   если оба «в космосе», и разводит два магазина, если один «фэнтези».

   ЧТО ДЕЛАЕМ. Две аддитивные колонки в `projects`:
     product_class TEXT        — класс продукта (lib/product-class);
     product_capabilities TEXT — JSON-массив НАЗВАННЫХ возможностей.

   Обе допускают NULL: «класс не выводили» — законное состояние, и оно
   отличается от `'unknown'`, то есть «выводили и не нашли функции».
   Смешать их нельзя: первое — отсутствие измерения, второе — факт о
   заявке.

   БЭКФИЛЛ ЗДЕСЬ ЗАКОНЕН, в отличие от миграции 100. Класс — чистая
   функция от названия и описания, которые в строке проекта лежат с
   первого дня. Пересчёт старых проектов тем же кодом не выдумывает
   данные, а применяет к уже имеющимся ровно то правило, что будет
   применяться к новым. Проверяемость сохраняется: любой может
   запустить `classifyProduct` на тех же двух полях и получить то же.

   Без бэкфилла механизм был бы честно пустым месяцами: похожие
   генерации искать не в чем, пока новые проекты не накопятся, и
   «платформа видит наперёд» осталось бы утверждением про код.

   Идемпотентно: PRAGMA-guard на колонки, бэкфилл только там, где
   `product_class IS NULL`. Самовызов на импорте.
   ================================================================ */

export function runProductClassMigration() {
  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`).get()
  if (!tableExists) return

  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("product_class")) {
    db.exec(`ALTER TABLE projects ADD COLUMN product_class TEXT`)
    console.log("✅ Migration 101: added projects.product_class")
  }
  if (!cols.includes("product_capabilities")) {
    db.exec(`ALTER TABLE projects ADD COLUMN product_capabilities TEXT`)
    console.log("✅ Migration 101: added projects.product_capabilities")
  }

  /* Поиск похожих генераций идёт по классу на каждом открытии окна создания проекта —
     индекс держит его дешёвым и на выросшей базе. */
  db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_product_class ON projects(product_class)`)

  /* --- Бэкфилл: класс выводится из уже лежащих названия и описания --- */
  const pending = db
    .prepare(`SELECT id, name, description FROM projects WHERE product_class IS NULL`)
    .all() as Array<{ id: number; name: string; description: string | null }>

  if (pending.length === 0) {
    console.log("✅ Migration 101: product class ready (нечего пересчитывать)")
    return
  }

  const update = db.prepare(`UPDATE projects SET product_class = ?, product_capabilities = ? WHERE id = ?`)
  const backfill = db.transaction((rows: typeof pending) => {
    for (const row of rows) {
      const match = classifyProduct(row.name, row.description)
      update.run(match.cls, JSON.stringify(match.capabilities), row.id)
    }
  })

  backfill(pending)
  console.log(`✅ Migration 101: product class ready (пересчитано проектов: ${pending.length})`)
}

runProductClassMigration()
