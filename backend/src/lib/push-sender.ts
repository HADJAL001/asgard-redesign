/**
 * Отправитель push-уведомлений через Expo Push API.
 * Токены собирает POST /push/register (см. push.routes.ts); здесь — доставка.
 * Best-effort: сетевые/HTTP-ошибки логируются, не бросаются наружу.
 */

export interface ExpoPushMessage {
  to: string
  title?: string
  body?: string
  data?: Record<string, unknown>
  sound?: "default"
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
const BATCH = 100 // Expo принимает до 100 сообщений за запрос

/** Отправляет пуши батчами по 100. Возвращает число отправленных сообщений. */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<number> {
  if (messages.length === 0) return 0

  let sent = 0
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      })
      if (res.ok) sent += batch.length
      else console.warn(`[push] Expo push вернул ${res.status}`)
    } catch (e: any) {
      console.warn("[push] Expo push failed:", e?.message)
    }
  }
  return sent
}
