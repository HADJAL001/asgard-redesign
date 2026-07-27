/* ================================================================
   Voice narration preference — озвучка результата ковки (Web Speech API).
   Отдельный тумблер от "Сенсорной подписи" (preferences.ts) — тот
   про звук/вибрацию UI-эффектов, этот про голосовое произнесение
   названия и редкости артефакта. По умолчанию выключено.
   ================================================================ */

const STORAGE_KEY = "osgard_voice_narration_enabled"
const CHANGE_EVENT = "osgard:voice-narration-pref"

export function getVoiceNarrationEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function setVoiceNarrationEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — тихо игнорируем
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function subscribeVoiceNarrationEnabled(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = () => cb()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}
