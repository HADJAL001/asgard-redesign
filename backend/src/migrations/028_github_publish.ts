import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 028: GitHub-токены для публикации проектов
   ----------------------------------------------------------------
   Отдельно от identity-only users.github_id (015_social_login.ts,
   scope read:user user:email — только вход). Здесь — токен с scope
   repo для реальной публикации сгенерированных приложений в GitHub
   пользователя (Git Data API, см. projects.routes.ts publish-github).
   Шифруется существующей encrypt()/decrypt() из utils/encryption.ts.
   ================================================================ */

export function runGithubPublishMigration() {
  const columns = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)

  const ensureColumn = (name: string, ddl: string) => {
    if (!columns.includes(name)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${ddl}`).run()
      columns.push(name)
    }
  }

  ensureColumn("github_publish_token_encrypted", "github_publish_token_encrypted TEXT")
  ensureColumn("github_publish_username", "github_publish_username TEXT")
  ensureColumn("github_publish_connected_at", "github_publish_connected_at INTEGER")
}

runGithubPublishMigration()
