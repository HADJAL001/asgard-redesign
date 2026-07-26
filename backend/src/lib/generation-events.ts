import { EventEmitter } from "node:events"

/* ================================================================
   OSGARD · Generation events — живой прогресс генерации проекта (SSE)
   ----------------------------------------------------------------
   Фоновый джоб генерации приложения (lib/project-generation.ts →
   runAppGenerationJob) эмитит стадии по мере реального прогресса
   («Анализирую замысел» → «Генерирую код» / «Адаптирую шаблон» →
   «Проверяю N файлов» → «Записываю файлы» → готово/ошибка). SSE-
   эндпоинт GET /projects/:id/stream (projects.routes.ts) слушает
   их и мгновенно проталкивает подключённому клиенту — страница
   проекта показывает живой лог рождения приложения вместо статичного
   спиннера. Опрос GET /projects/:id остаётся резервным каналом.

   Зачем буфер (recentStages): джоб запускается fire-and-forget сразу
   после ответа 202, а клиент подписывается уже ПОСЛЕ навигации на
   /projects/:id — первые стадии могли отыграть до подписки. Держим
   маленький кольцевой буфер последних стадий на проект, чтобы поздний
   подписчик получил накопленный лог, а не пустоту. После терминальной
   стадии буфер живёт ещё TERMINAL_TTL_MS (на случай мгновенного
   реконнекта), затем очищается — без утечки памяти на завершённых.
   ================================================================ */

/** Идентификаторы стадий. Клиент маппит их в человекочитаемый текст (i18n). */
export type GenerationStage =
  | "analyzing" // разбор замысла (тема/ключевые слова)
  | "designing" // выбор дизайн-системы приложения (архетип, палитра, типографика)
  | "template" // найден шаблон — адаптируем
  | "ai" // шаблона нет — генерируем код через AI
  | "validating" // проверка сгенерированных файлов
  | "writing" // запись файлов проекта в БД
  | "ready" // терминальная: успех
  | "failed" // терминальная: ошибка

export type GenerationStageEvent = {
  type: "stage"
  projectId: number
  stage: GenerationStage
  /** Короткий тех-лейбл (fallback, если у клиента нет перевода стадии). */
  label: string
  /** Прогресс 0..1 для полосы (грубая оценка по этапу). */
  progress: number
  /** Кол-во файлов — для стадий validating/writing/ready. */
  fileCount?: number
  /** Источник кода на терминале ready: 'ai' | 'template' | 'local'. */
  source?: string
  /** Текст ошибки на терминале failed. */
  error?: string
  at: number
}

/** Общая шина: событие "gen:<projectId>" несёт GenerationStageEvent.
 *  Одно SSE-подключение на активную вкладку страницы проекта → лимит слушателей снят. */
export const generationEvents = new EventEmitter()
generationEvents.setMaxListeners(0)

const BUFFER_CAP = 24 // максимум стадий в буфере одного проекта
const TERMINAL_TTL_MS = 30_000 // сколько держать буфер после ready/failed

const recentStages = new Map<number, GenerationStageEvent[]>()
const terminalTimers = new Map<number, NodeJS.Timeout>()

function isTerminal(stage: GenerationStage): boolean {
  return stage === "ready" || stage === "failed"
}

/** Эмитит стадию генерации: кладёт в буфер проекта и проталкивает подписчикам SSE. */
export function emitGenerationStage(evt: Omit<GenerationStageEvent, "type" | "at"> & { at?: number }) {
  const full: GenerationStageEvent = {
    type: "stage",
    at: evt.at ?? Date.now(),
    projectId: evt.projectId,
    stage: evt.stage,
    label: evt.label,
    progress: evt.progress,
    fileCount: evt.fileCount,
    source: evt.source,
    error: evt.error,
  }

  const buf = recentStages.get(full.projectId) ?? []
  buf.push(full)
  // Кольцевой буфер: не даём разрастись (обычно 4-6 стадий, cap — страховка).
  while (buf.length > BUFFER_CAP) buf.shift()
  recentStages.set(full.projectId, buf)

  generationEvents.emit(`gen:${full.projectId}`, full)

  if (isTerminal(full.stage)) {
    // Держим буфер ещё немного (реконнект), потом чистим — без утечки на завершённых.
    const prev = terminalTimers.get(full.projectId)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => {
      recentStages.delete(full.projectId)
      terminalTimers.delete(full.projectId)
    }, TERMINAL_TTL_MS)
    // Не держим процесс живым только ради очистки буфера.
    if (typeof timer.unref === "function") timer.unref()
    terminalTimers.set(full.projectId, timer)
  }
}

/** Буферизованные стадии проекта — отдаём позднему подписчику при подключении. */
export function getRecentStages(projectId: number): GenerationStageEvent[] {
  return recentStages.get(projectId) ?? []
}
