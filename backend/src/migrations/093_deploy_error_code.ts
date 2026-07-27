import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 093: код причины отказа деплоя
   ----------------------------------------------------------------
   ПРОБЛЕМА. `projects.deploy_error` — произвольная человекочитаемая
   строка. Фронтенд не может по ней решить, стоит ли разрешать
   повторный клик «Задеплоить»: конфигурационная ошибка сервера
   (нет NETLIFY_AUTH_TOKEN) гарантированно повторится один в один,
   а сетевой сбой Netlify — нет. Из-за этого либо кнопка всегда
   активна (бессмысленные ретраи при config_missing), либо всегда
   заблокирована (нельзя повторить транзиентный сбой).

   Аддитивная колонка `deploy_error_code TEXT`:
     config_missing | no_files | build_failed | network | unknown | NULL

   Идемпотентно: PRAGMA-guard. Самовызов на импорте.
   ================================================================ */

export function runDeployErrorCodeMigration() {
  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("deploy_error_code")) {
    db.exec(`ALTER TABLE projects ADD COLUMN deploy_error_code TEXT`)
    console.log("✅ Migration 093: added projects.deploy_error_code")
  }

  console.log("✅ Migration 093: deploy error classification ready")
}

runDeployErrorCodeMigration()
