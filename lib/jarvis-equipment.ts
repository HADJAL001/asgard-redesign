/* ================================================================
   OSGARD · JARVIS Equipment store
   ----------------------------------------------------------------
   Единый источник правды об экипировке ДЖАРВИСА (скин / голос /
   аксессуар), надетой текущим пользователем.

   - Кэшируется в localStorage (ключ "jarvis_equipment") для
     мгновенного отображения при открытии чата, без ожидания сети.
   - Синхронизируется с бэкендом через GET /jarvis/my-accessories.
   - Любое изменение (после покупки/надевания в магазине) рассылается
     всем открытым компонентам через window CustomEvent
     "jarvis-equipment-changed" — 3D-аватар и чат перерисовываются
     без перезагрузки страницы.
   ================================================================ */

import apiClient from "./api-client"

export type AccessoryType = "skin" | "voice" | "accessory"

export type EquippedAccessory = {
  id: number
  name: string
  description: string
  price: number
  image: string
  type: AccessoryType
  equipped: 0 | 1
  purchasedAt?: number
}

/** Текущая экипировка ДЖАРВИСА — по одному предмету на каждый слот (skin/voice/accessory). */
export type JarvisEquipment = {
  skin: EquippedAccessory | null
  voice: EquippedAccessory | null
  accessory: EquippedAccessory | null
}

export const EQUIPMENT_STORAGE_KEY = "jarvis_equipment"
export const EQUIPMENT_EVENT = "jarvis-equipment-changed"

export const EMPTY_EQUIPMENT: JarvisEquipment = { skin: null, voice: null, accessory: null }

/* ----------------------------------------------------------------
   localStorage: чтение / запись
   ---------------------------------------------------------------- */

export function loadEquipmentFromCache(): JarvisEquipment {
  if (typeof window === "undefined") return EMPTY_EQUIPMENT
  try {
    const raw = localStorage.getItem(EQUIPMENT_STORAGE_KEY)
    if (!raw) return EMPTY_EQUIPMENT
    const parsed = JSON.parse(raw)
    return {
      skin: parsed?.skin ?? null,
      voice: parsed?.voice ?? null,
      accessory: parsed?.accessory ?? null,
    }
  } catch {
    return EMPTY_EQUIPMENT
  }
}

function saveEquipmentToCache(equipment: JarvisEquipment) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(equipment))
  } catch {
    /* ignore quota/storage errors */
  }
}

/** Рассылает событие всем подписчикам (аватар в чате, магазин и т.д.) о смене экипировки. */
export function broadcastEquipmentChange(equipment: JarvisEquipment) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<JarvisEquipment>(EQUIPMENT_EVENT, { detail: equipment }))
}

/** Собирает JarvisEquipment из плоского списка аксессуаров (owned/equipped=1 по каждому типу). */
export function buildEquipmentFromItems(items: EquippedAccessory[]): JarvisEquipment {
  const equipment: JarvisEquipment = { ...EMPTY_EQUIPMENT }
  for (const item of items) {
    if (item.equipped && (item.type === "skin" || item.type === "voice" || item.type === "accessory")) {
      equipment[item.type] = item
    }
  }
  return equipment
}

/** Сохраняет экипировку в кэш и рассылает событие всем подписанным компонентам. */
export function setEquipmentAndBroadcast(equipment: JarvisEquipment) {
  saveEquipmentToCache(equipment)
  broadcastEquipmentChange(equipment)
}

/* ----------------------------------------------------------------
   Синхронизация с бэкендом
   ---------------------------------------------------------------- */

/**
 * Подтягивает актуальную экипировку пользователя с бэкенда
 * (GET /jarvis/my-accessories), обновляет localStorage-кэш
 * и рассылает событие. Возвращает свежую экипировку.
 *
 * Если запрос не удался (нет сети/не авторизован) — тихо оставляет
 * то, что уже есть в кэше.
 */
export async function fetchEquipmentFromServer(): Promise<JarvisEquipment> {
  try {
    const data = await apiClient.get<{ items: EquippedAccessory[] }>("/jarvis/my-accessories", { skipAuthRedirect: true })
    const equipment = buildEquipmentFromItems(data.items || [])
    setEquipmentAndBroadcast(equipment)
    return equipment
  } catch {
    return loadEquipmentFromCache()
  }
}

/**
 * Подписка на изменения экипировки (событие + сторонние вкладки через "storage").
 * Возвращает функцию отписки.
 */
export function subscribeToEquipmentChanges(callback: (equipment: JarvisEquipment) => void): () => void {
  if (typeof window === "undefined") return () => {}

  function handleCustomEvent(e: Event) {
    const detail = (e as CustomEvent<JarvisEquipment>).detail
    callback(detail || loadEquipmentFromCache())
  }

  function handleStorageEvent(e: StorageEvent) {
    if (e.key === EQUIPMENT_STORAGE_KEY) {
      callback(loadEquipmentFromCache())
    }
  }

  window.addEventListener(EQUIPMENT_EVENT, handleCustomEvent as EventListener)
  window.addEventListener("storage", handleStorageEvent)

  return () => {
    window.removeEventListener(EQUIPMENT_EVENT, handleCustomEvent as EventListener)
    window.removeEventListener("storage", handleStorageEvent)
  }
}

/* ----------------------------------------------------------------
   Хелпер для голосовых аксессуаров: подбор параметров SpeechSynthesis
   по названию купленного "voice"-аксессуара.
   ---------------------------------------------------------------- */

export type VoiceProfile = { pitch: number; rate: number; langHint?: string }

export function resolveVoiceProfile(voice: EquippedAccessory | null): VoiceProfile {
  if (!voice) return { pitch: 1, rate: 1 }
  const name = voice.name.toLowerCase()
  if (name.includes("британ")) return { pitch: 0.95, rate: 0.95, langHint: "en" }
  if (name.includes("женск") || name.includes("аврор") || name.includes("aurora")) return { pitch: 1.35, rate: 1.05 }
  if (name.includes("робот") || name.includes("бас")) return { pitch: 0.55, rate: 0.9 }
  return { pitch: 1, rate: 1 }
}
