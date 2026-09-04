import { hasCompleteProjectBrief } from "@/lib/project-brief"

/* ================================================================
   pending-generation — «отложенное намерение генерации» гостя
   ----------------------------------------------------------------
   Мост hero-форма лендинга → реальная генерация проекта. Гость не
   авторизован и не может вызвать POST /projects/generate (нужен
   аккаунт). Поэтому запрос из hero сохраняется здесь, гость уходит
   на /register, а после входа дашборд ЗАБИРАЕТ намерение и запускает
   настоящую генерацию (generateProject → реальный код + артефакты).

   Дизайн — по образцу lib/demo-client.ts (чистые функции без React):
     • одноразовость — takePendingGeneration() читает И сразу очищает,
       поэтому повторный заход на дашборд не триггерит генерацию снова
       и двойной эффект в React StrictMode безопасен;
     • TTL — протухшее намерение (забытая вкладка, вход через неделю)
       игнорируется, чтобы не создать неожиданный проект;
     • SSR-safe — доступ к localStorage обёрнут в try/typeof-guard.
   ================================================================ */

export interface PendingGeneration {
  /** Явное имя проекта, если человек его указал. Необязательно: свободная фраза
   *  из hero-формы идёт в hint, а имя выводит бэкенд из неё же кодом
   *  (lib/project-title.ts на бэкенде) — как и у остальных точек входа. */
  name?: string
  /** Идея/бриф из hero-формы — то, что реально описал человек. */
  hint?: string
  /** Необязательная глубина (quick|standard|deep). По умолчанию бэкенд берёт quick (бесплатно). */
  depth?: string
  /** Момент сохранения (мс) — для проверки TTL. */
  savedAt: number
}

export const PENDING_GEN_KEY = "osgard_pending_gen"

/** Сколько живёт намерение до автоматического протухания (30 минут). */
export const PENDING_GEN_TTL_MS = 30 * 60 * 1000

interface SaveInput {
  name?: string
  hint?: string
  depth?: string
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

/**
 * Сохраняет намерение генерации перед уходом гостя на регистрацию.
 * Нужна хоть какая-то суть (имя ИЛИ бриф) — иначе сохранять нечего.
 */
export function savePendingGeneration(input: SaveInput): void {
  if (!hasStorage()) return
  const name = (input.name ?? "").trim() || undefined
  const hint = (input.hint ?? "").trim() || undefined
  if (!hasCompleteProjectBrief(hint)) return
  const payload: PendingGeneration = {
    name,
    hint,
    depth: input.depth || undefined,
    savedAt: Date.now(),
  }
  try {
    window.localStorage.setItem(PENDING_GEN_KEY, JSON.stringify(payload))
  } catch {
    /* приватный режим / переполнение — молча пропускаем, мост просто не сработает */
  }
}

/** Полностью удаляет сохранённое намерение. */
export function clearPendingGeneration(): void {
  if (!hasStorage()) return
  try {
    window.localStorage.removeItem(PENDING_GEN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Читает намерение генерации, НЕ удаляя его. Возвращает null, если его нет,
 * оно повреждено или протухло по TTL (в последнем случае заодно чистит ключ).
 * Для запуска используйте takePendingGeneration() — он одноразовый.
 */
export function peekPendingGeneration(): PendingGeneration | null {
  if (!hasStorage()) return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(PENDING_GEN_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: PendingGeneration
  try {
    parsed = JSON.parse(raw) as PendingGeneration
  } catch {
    clearPendingGeneration()
    return null
  }

  const name = typeof parsed?.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined
  const hint = typeof parsed?.hint === "string" && parsed.hint.trim() ? parsed.hint.trim() : undefined
  const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : 0
  if ((!name && !hint) || !savedAt || !hasCompleteProjectBrief(hint)) {
    clearPendingGeneration()
    return null
  }
  if (Date.now() - savedAt > PENDING_GEN_TTL_MS) {
    clearPendingGeneration()
    return null
  }

  return {
    name,
    hint,
    depth: typeof parsed.depth === "string" && parsed.depth ? parsed.depth : undefined,
    savedAt,
  }
}

/**
 * Атомарно забирает намерение: читает валидное значение И сразу очищает ключ.
 * Возвращает null, если брать нечего. Одноразовость гарантирует, что даже при
 * двойном вызове (React StrictMode) генерация запустится ровно один раз.
 */
export function takePendingGeneration(): PendingGeneration | null {
  const pending = peekPendingGeneration()
  // Чистим ВСЕГДА: и на успех (одноразовость), и на протухшее/битое значение.
  clearPendingGeneration()
  return pending
}
