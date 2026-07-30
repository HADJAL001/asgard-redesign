import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 094: «Уникальная AI-иллюстрация артефакта»
   ----------------------------------------------------------------
   Айдентика (082) дала артефакту детерминированное ОПИСАНИЕ облика
   (архетип/материал/эссенция/палитра), но не картинку — витрина всё ещё
   показывает символ редкости, а не лицо. Эта миграция готовит место под
   реальную сгенерированную иллюстрацию, которую присылает локальный
   воркер-мост (RTX 5070, Stable Diffusion, work/ai-media/generate.sh) —
   генерация асинхронна и не блокирует ковку.

   Аддитивна и prod-safe:

   1. artifacts.illustration_url        TEXT (nullable) — готовая картинка
      как data URI (data:image/png;base64,...). Нет отдельного объектного
      хранилища (S3/Cloudinary/Vercel Blob) в этом проекте — сознательный
      выбор без нового внешнего сервиса, см. честный disclosure в PR.
   2. artifacts.illustration_status     TEXT (nullable) — 'queued' |
      'in_progress' | 'ready' | 'failed'. NULL = иллюстрация не заказана
      (legacy-артефакты или воркер выключен) — фронтенд трактует NULL так
      же, как 'failed': fallback на иконку редкости.
   3. artifacts.illustration_prompt     TEXT (nullable) — промпт, с которым
      был поставлен job (для отладки/переген).
   4. artifacts.illustration_queued_at  INTEGER (nullable) — unix ms,
      момент постановки в очередь (нужен для TOCTOU-safe re-claim зависших
      'in_progress' job'ов воркер-роутом).

   Grandfather: старые артефакты — everywhere NULL, никогда не ставятся в
   очередь задним числом (это дорогая генерация, а не бесплатный derive).
   Фронтенд для них просто показывает текущий fallback (иконку редкости).

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 082).
   ================================================================ */

export function runArtifactIllustrationMigration() {
  const artifactsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()
  if (!artifactsExists) return

  const cols = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("illustration_url")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN illustration_url TEXT`)
    console.log("✅ Migration 093: added artifacts.illustration_url")
  }
  if (!cols.includes("illustration_status")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN illustration_status TEXT`)
    console.log("✅ Migration 093: added artifacts.illustration_status")
  }
  if (!cols.includes("illustration_prompt")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN illustration_prompt TEXT`)
    console.log("✅ Migration 093: added artifacts.illustration_prompt")
  }
  if (!cols.includes("illustration_queued_at")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN illustration_queued_at INTEGER`)
    console.log("✅ Migration 093: added artifacts.illustration_queued_at")
  }

  // Grandfather: существующие артефакты остаются с NULL везде — в очередь
  // задним числом не ставим (дорогая генерация). Фронтенд трактует NULL
  // как «нет иллюстрации», показывает текущий fallback (иконку редкости).
  console.log("✅ Migration 093: Artifact illustration columns ready (legacy artifacts grandfathered)")
}

runArtifactIllustrationMigration()
