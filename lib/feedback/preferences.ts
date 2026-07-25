/* ================================================================
   OSGARD · Sensory Signature — preference (opt-in, default OFF)
   ----------------------------------------------------------------
   Единый источник правды для тумблера «Звук/Вибрация». Хранится в
   localStorage, читается и хуком hooks/useSignature.ts, и тумблером
   в components/profile-view.tsx. Дефолт — ВЫКЛ: у текущих
   пользователей поведение не меняется (prod-safe).

   Без React-состояния (как lib/voice.service.ts): подписка идёт
   через window-события, чтобы hook и настройки жили синхронно даже
   между вкладками (storage-событие).
   ================================================================ */

const STORAGE_KEY = "osgard_signature_enabled"
const CHANGE_EVENT = "osgard:signature-pref"

/** SSR-safe чтение тумблера. По умолчанию false (тишина). */
export function getSignatureEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    // приватный режим / заблокированный storage — деградируем в «выкл»
    return false
  }
}

/** Записывает тумблер и оповещает подписчиков в этой же вкладке. */
export function setSignatureEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    /* ignore — всё равно оповестим подписчиков */
  }
  window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: enabled }))
}

/**
 * Подписка на изменения тумблера. Реагирует и на CustomEvent (та же вкладка),
 * и на storage-событие (другая вкладка). Возвращает функцию отписки.
 */
export function subscribeSignatureEnabled(cb: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onCustom = (e: Event) => cb((e as CustomEvent<boolean>).detail)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(e.newValue === "1")
  }
  window.addEventListener(CHANGE_EVENT, onCustom)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom)
    window.removeEventListener("storage", onStorage)
  }
}
