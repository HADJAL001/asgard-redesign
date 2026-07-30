import { EventEmitter } from "node:events"
import { currentTelemetry } from "./generation-telemetry"

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
  | "building" // инженерная проверка работоспособности (целостность/сборка)
  | "repairing" // платформа чинит найденные дефекты
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
  /** Сколько инженерных дефектов известно на стадиях building/repairing. */
  defects?: number
  /** Инженерный вердикт на терминале ready: passed | repaired | broken | unverified. */
  verdict?: string
  /* --- Счётчик расхода (lib/generation-telemetry). Приходит на каждой стадии,
     чтобы цифры в интерфейсе росли по мере работы, а не появлялись в конце:
     непредсказуемость расхода — главная претензия рынка к AI-сборщикам. --- */
  /** Сколько обращений к моделям сделано на этот момент. */
  aiCalls?: number
  /** Токенов отправлено моделям. */
  tokensIn?: number
  /** Токенов получено от моделей. */
  tokensOut?: number
  /** Сколько вызовов не отдали точный usage — оговорка к точности цифры. */
  tokensEstimated?: number
  /** true на терминале ready, если приложение заработало без единого ремонта. */
  firstTry?: boolean
  /** true, если платформа признала промах и выдала право на бесплатную перегенерацию
   *  (lib/generation-makegood). Приходит вместе с самим провалом — иначе человек узнал
   *  бы о компенсации случайно, при следующем запуске. */
  makegood?: boolean
  at: number
}

/** Событие «расход изменился» — отдельно от стадий.
 *
 *  Зачем отдельный тип, а не ещё одна стадия: самая долгая часть генерации —
 *  одна стадия `ai`, внутри которой десятки вызовов моделей. Если счётчик
 *  обновлять только на смене стадии, человек минуту смотрит на замерший расход
 *  и не понимает, идёт работа или всё встало. Здесь цифры тикают по факту
 *  каждого вызова к модели.
 *
 *  В буфер стадий такие события НЕ кладутся: они не про прогресс и мгновенно
 *  устаревают. Поздний подписчик получит актуальный расход из ближайшей
 *  стадии — тот же счётчик подмешан и туда. */
export type GenerationMeterEvent = {
  type: "meter"
  projectId: number
  aiCalls: number
  tokensIn: number
  tokensOut: number
  /** Сколько вызовов не отдали точный usage — оговорка к точности цифры. */
  tokensEstimated: number
  /** Сумма времени сетевых вызовов (без пауз между ними). */
  aiMs: number
  at: number
}

/** Всё, что может прийти подписчику канала "gen:<projectId>". */
export type GenerationStreamEvent = GenerationStageEvent | GenerationMeterEvent

/** Общая шина: событие "gen:<projectId>" несёт GenerationStreamEvent.
 *  Одно SSE-подключение на активную вкладку страницы проекта → лимит слушателей снят. */
export const generationEvents = new EventEmitter()
generationEvents.setMaxListeners(0)

/* Троттлинг живого счётчика: при параллельной генерации файлов вызовы
   возвращаются пачками, и без ограничения на каждую пачку ушёл бы десяток
   кадров в одну миллисекунду. Пропущенный тик безвреден — расход только
   растёт, а финальные числа всё равно придут со следующей стадией. */
const METER_MIN_INTERVAL_MS = 300
const lastMeterAt = new Map<number, number>()

const BUFFER_CAP = 24 // максимум стадий в буфере одного проекта
const TERMINAL_TTL_MS = 30_000 // сколько держать буфер после ready/failed

const recentStages = new Map<number, GenerationStageEvent[]>()
const terminalTimers = new Map<number, NodeJS.Timeout>()

function isTerminal(stage: GenerationStage): boolean {
  return stage === "ready" || stage === "failed"
}

/** Эмитит стадию генерации: кладёт в буфер проекта и проталкивает подписчикам SSE. */
export function emitGenerationStage(evt: Omit<GenerationStageEvent, "type" | "at"> & { at?: number }) {
  /* Счётчик расхода подмешивается сам из активного контекста телеметрии
     (lib/generation-telemetry). Так ни одна стадия не может «забыть» показать
     расход: добавлять поля вручную в каждый из десятка вызовов — гарантия того,
     что где-то они разойдутся. Явно переданное значение имеет приоритет. */
  const meter = currentTelemetry()

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
    defects: evt.defects,
    verdict: evt.verdict,
    aiCalls: evt.aiCalls ?? meter?.calls,
    tokensIn: evt.tokensIn ?? meter?.inputTokens,
    tokensOut: evt.tokensOut ?? meter?.outputTokens,
    tokensEstimated: evt.tokensEstimated ?? meter?.unmeasured,
    firstTry: evt.firstTry,
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
      lastMeterAt.delete(full.projectId)
    }, TERMINAL_TTL_MS)
    // Не держим процесс живым только ради очистки буфера.
    if (typeof timer.unref === "function") timer.unref()
    terminalTimers.set(full.projectId, timer)
  }
}

/** Проталкивает подписчикам текущий расход генерации, не меняя стадию.
 *
 *  Вызывается из onUpdate-слушателя телеметрии (lib/project-generation.ts),
 *  то есть по факту каждого обращения к модели. Ничего не бросает наружу:
 *  живой счётчик не имеет права уронить генерацию. */
export function emitGenerationMeter(
  projectId: number,
  meter: { calls: number; inputTokens: number; outputTokens: number; unmeasured: number; aiMs: number },
) {
  const now = Date.now()
  const prev = lastMeterAt.get(projectId) ?? 0
  if (now - prev < METER_MIN_INTERVAL_MS) return
  lastMeterAt.set(projectId, now)

  const evt: GenerationMeterEvent = {
    type: "meter",
    projectId,
    aiCalls: meter.calls,
    tokensIn: meter.inputTokens,
    tokensOut: meter.outputTokens,
    tokensEstimated: meter.unmeasured,
    aiMs: meter.aiMs,
    at: now,
  }
  generationEvents.emit(`gen:${projectId}`, evt)
}

/** Буферизованные стадии проекта — отдаём позднему подписчику при подключении. */
export function getRecentStages(projectId: number): GenerationStageEvent[] {
  return recentStages.get(projectId) ?? []
}
