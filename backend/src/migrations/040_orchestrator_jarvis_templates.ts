import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 040: шаблоны ДЖАРВИСА для оркестратора

   is_jarvis_template — отличает публикацию цепочки «как шаблона
   ДЖАРВИСА» (ДЖАРВИС предлагает её другим пользователям в рекомендациях)
   от обычного is_public/price_tc, которые описывают платный маркетплейс.
   Шаблон ДЖАРВИСА всегда публичный (is_public=1), но не каждая публичная
   цепочка — шаблон ДЖАРВИСА.
   ================================================================ */

export function runOrchestratorJarvisTemplatesMigration() {
  const columns = (db.prepare(`PRAGMA table_info(orchestrator_chains)`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  )

  if (!columns.includes("is_jarvis_template")) {
    db.prepare(`ALTER TABLE orchestrator_chains ADD COLUMN is_jarvis_template INTEGER NOT NULL DEFAULT 0`).run()
  }
}

runOrchestratorJarvisTemplatesMigration()
