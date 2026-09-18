import db from "./db"
import { createActivityEvent } from "./activity"
import type { TelemetrySnapshot } from "./generation-telemetry"

/* ================================================================
   OSGARD · Бейджи за стиль работы
   ----------------------------------------------------------------
   Отдельно от «Ранга Вайбкодера» (architect-progression.ts): ранг растёт
   монотонно за объём дел, бейджи — моментальные знаки отличия за стиль
   ОДНОГО события. Выдаются по уже существующим данным (телеметрия
   генерации, deploy_status, баланс кошелька) — новой системы прогрессии
   не создаём, только фиксируем факт.

   Идемпотентно: UNIQUE(user_id, badge_key) в схеме (миграция 112) —
   повторное условие того же стиля не создаёт дубль и не шумит в ленте.
   Guarded/best-effort: любая ошибка проглатывается, выдача бейджа не
   должна ронять генерацию/деплой.
   ================================================================ */

export type BadgeKey = "speedrunner" | "philosopher" | "clean_deploy" | "on_the_edge"

const BADGE_LABEL: Record<BadgeKey, string> = {
  speedrunner: "🚀 Скорострел",
  philosopher: "🧠 Философ",
  clean_deploy: "🛡️ Чистюля",
  on_the_edge: "🔥 На грани",
}

/** Порог «быстрой» генерации — меньше этого времени говорит о том, что
 *  запрос был простым/чётким, а не о качестве платформы, поэтому порог
 *  выбран консервативно (генерации короче минуты редки и заметны). */
const SPEEDRUN_MS = 60_000

function grantBadge(userId: number, key: BadgeKey, meta?: Record<string, unknown>): boolean {
  try {
    const result = db
      .prepare(`INSERT OR IGNORE INTO user_badges (user_id, badge_key, meta) VALUES (?, ?, ?)`)
      .run(userId, key, meta ? JSON.stringify(meta) : null)
    if (result.changes === 0) return false // уже был выдан раньше — не шумим повторно

    try {
      createActivityEvent({
        userId,
        type: "badge_earned",
        entityType: "user",
        entityId: userId,
        text: `получил бейдж «${BADGE_LABEL[key]}»`,
        metadata: { badgeKey: key },
      })
    } catch {
      /* лента недоступна — выдача бейджа важнее */
    }
    return true
  } catch {
    return false
  }
}

/** Вызывается по факту завершения генерации (успешной). Оценивает стиль
 *  по уже собранной телеметрии — ничего не пересчитывает заново. */
export function evaluateGenerationBadges(userId: number, snapshot: TelemetrySnapshot | null): void {
  if (!snapshot) return
  try {
    if (snapshot.elapsedMs > 0 && snapshot.elapsedMs < SPEEDRUN_MS) {
      grantBadge(userId, "speedrunner", { elapsedMs: snapshot.elapsedMs })
    }
    const providerCount = Object.keys(snapshot.byProvider ?? {}).length
    if (providerCount >= 2) {
      grantBadge(userId, "philosopher", { providerCount })
    }
  } catch {
    /* best-effort — оценка стиля не должна ронять генерацию */
  }
}

/** Вызывается по факту успешного деплоя. attemptNumber — какой это был
 *  по счёту деплой этого проекта (1 = с первого раза, без ремонта). */
export function evaluateDeployBadge(userId: number, attemptNumber: number): void {
  if (attemptNumber === 1) {
    grantBadge(userId, "clean_deploy", { attemptNumber })
  }
}

/** Вызывается после операции, списавшей кредиты — если баланс дошёл до
 *  нуля, это осознанный риск «на всё», а не случайность (нулевой баланс
 *  ДО операции не считается — тут важен именно момент обнуления). */
export function evaluateCreditsBadge(userId: number, creditsBefore: number, creditsAfter: number): void {
  if (creditsBefore > 0 && creditsAfter <= 0) {
    grantBadge(userId, "on_the_edge", { creditsBefore })
  }
}

export function listUserBadges(userId: number): Array<{ badgeKey: BadgeKey; label: string; earnedAt: string }> {
  try {
    const rows = db
      .prepare(`SELECT badge_key AS badgeKey, earned_at AS earnedAt FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC`)
      .all(userId) as Array<{ badgeKey: BadgeKey; earnedAt: string }>
    return rows.map((r) => ({ ...r, label: BADGE_LABEL[r.badgeKey] ?? r.badgeKey }))
  } catch {
    return []
  }
}
