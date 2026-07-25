import db from "./db"
import type { Statement } from "better-sqlite3"

/* ================================================================
   OSGARD · Серверная аналитика продуктовых событий (петля роста)
   ----------------------------------------------------------------
   Пишет в ту же таблицу `analytics_events` (миграция 066), что и
   клиентский приёмник POST /analytics/event. Разница — эти события
   фиксируются НА СЕРВЕРЕ в момент реального действия (регистрация,
   логин, конвертация демо, просмотр публичной share-карточки),
   поэтому они надёжны: их нельзя пропустить из-за блокировщика,
   оффлайна или того, что юзер не долистал до JS-трекера.

   Главный инвариант: аналитика НИКОГДА не должна ронять или замедлять
   основной запрос. Любая ошибка записи проглатывается — потеря одного
   события несравнимо дешевле упавшего логина/регистрации. Поэтому
   track() синхронный (одна вставка по индексируемой таблице — доли мс
   на better-sqlite3), но целиком обёрнут в try/catch.

   session_id в таблице NOT NULL. Для серверных событий клиентской
   сессии может не быть, поэтому синтезируем стабильный маркер:
   `srv:u<id>` для авторизованных, `srv:anon` для гостевых. Это не
   мешает склейке с клиентскими сессиями по user_id.
   ================================================================ */

/** Канонические имена серверных событий роста — единый источник, чтобы
 *  строка события в инструментировании и в дашборде не разъезжались. */
export const GrowthEvent = {
  Register: "register",
  Login: "login",
  DemoConvert: "demo_convert",
  ShareView: "artifact_share_view",
  ShareClick: "artifact_share_click",
} as const

export type GrowthEventName = (typeof GrowthEvent)[keyof typeof GrowthEvent]

const MAX_META_JSON_LENGTH = 2000

/* Ленивый prepared statement: к моменту первого track() сервер уже прошёл
   миграции (066 создаёт таблицу при старте). Кэшируем, чтобы не готовить
   выражение на каждом горячем вызове. */
let insertStmt: Statement | null = null
function insert(): Statement {
  if (!insertStmt) {
    insertStmt = db.prepare(
      `INSERT INTO analytics_events (user_id, session_id, event_name, meta, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
  }
  return insertStmt
}

export interface TrackOptions {
  /** id авторизованного пользователя; null/undefined — гостевое событие. */
  userId?: number | null
  /** Клиентский session_id, если доступен (для склейки anonymous → registered). */
  sessionId?: string
  /** Произвольные атрибуты события; сериализуются в JSON (обрезаются до 2 КБ). */
  meta?: Record<string, unknown>
}

/**
 * Зафиксировать продуктовое событие. Fire-and-forget: никогда не бросает.
 */
export function track(event: string, opts: TrackOptions = {}): void {
  try {
    const userId = opts.userId ?? null
    const sessionId = opts.sessionId ?? (userId != null ? `srv:u${userId}` : "srv:anon")

    let metaJson: string | null = null
    if (opts.meta != null) {
      const serialized = JSON.stringify(opts.meta)
      metaJson = serialized.length > MAX_META_JSON_LENGTH ? serialized.slice(0, MAX_META_JSON_LENGTH) : serialized
    }

    insert().run(userId, sessionId, event, metaJson, Date.now())
  } catch {
    /* аналитика не должна ронять основной запрос — намеренно проглатываем */
  }
}
