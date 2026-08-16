import db from "./db"
import { captureError } from "./sentry"
import { GENERATION_DEPTHS, type GenerationDepth } from "./generation-depths"

/* ================================================================
   OSGARD · Перегенерация за счёт платформы (make-good)
   ----------------------------------------------------------------
   Принцип один: за СВОЙ промах платит платформа, а не пользователь.

   Промах — это не «человеку не понравился результат» (вкус не дефект), а
   доказанная неработоспособность выдачи: инженерный вердикт `broken`,
   блокирующие ошибки импортов (приложение физически не собирается) или
   падение самого джоба генерации. Во всех трёх случаях виноват генератор.

   Право выдаётся автоматически в момент признания провала и тратится на
   следующем запуске: без кредитов и без списания дневной квоты.

   Три правила, без которых механика превратилась бы в дыру в экономике:

   1. ОДИН ПРОВАЛ — ОДНО ПРАВО (`project_id UNIQUE` в миграции 098).
      Повторный ремонт того же проекта новых прав не рождает.
   2. ПРАВО НЕ ДЕШЕВЕЕТ И НЕ ДОРОЖАЕТ: покрывает глубину не дороже той,
      что провалилась. За провал «быстрой» нельзя получить «глубокую».
   3. ТРАТИТСЯ, ТОЛЬКО ЕСЛИ РЕАЛЬНО НУЖНО. Быстрая генерация и так не
      стоит кредитов — там право берётся лишь когда дневная квота
      исчерпана (то есть когда без него человек получил бы отказ).
      Решение об этом принимает вызывающий маршрут: он один знает,
      исчерпана ли квота.

   Таблица может отсутствовать (старая схема в части тестов) — тогда
   каждая функция честно деградирует в «прав нет». Ни одна из них не
   имеет права уронить генерацию: компенсация — добавка к выдаче, а не
   её условие (тот же принцип, что у persistGenerationMeter).
   ================================================================ */

/** Почему платформа признала промах. Все три — вина генератора, не пользователя. */
export type MakegoodReason =
  /** Инженерный контур вынес вердикт `broken`: дефекты остались после ремонта. */
  | "broken"
  /** Блокирующие ошибки импортов: приложение физически не собирается. */
  | "unbuildable"
  /** Джоб генерации упал с исключением — человек не получил вообще ничего. */
  | "crashed"

export type MakegoodRight = {
  id: number
  projectId: number
  depth: GenerationDepth
  credits: number
  reason: MakegoodReason
  createdAt: number
}

/** Человекочитаемая причина — идёт в интерфейс, поэтому формулируется от лица платформы. */
export const MAKEGOOD_REASON_TEXT: Record<MakegoodReason, string> = {
  broken: "проверка нашла дефекты, которые платформа не смогла починить",
  unbuildable: "приложение не собиралось из-за несогласованных импортов",
  crashed: "генерация оборвалась ошибкой платформы",
}

/**
 * Выдаёт право на перегенерацию за счёт платформы.
 *
 * Вызывается из фонового джоба генерации, поэтому НИКОГДА не бросает: провал
 * выдачи уже случился, и уронить на компенсации ещё и запись результата значило бы
 * наказать пользователя дважды.
 *
 * Возвращает true, если право появилось именно сейчас (false — уже было или
 * таблицы нет). `INSERT OR IGNORE` вместе с UNIQUE(project_id) делает вызов
 * идемпотентным: повторный ремонт того же проекта права не удваивает.
 */
export function grantMakegood(params: {
  userId: number
  projectId: number
  depth: GenerationDepth
  reason: MakegoodReason
}): boolean {
  try {
    const credits = GENERATION_DEPTHS[params.depth]?.credits ?? 0
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO generation_makegoods (user_id, project_id, depth, credits, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(params.userId, params.projectId, params.depth, credits, params.reason, Date.now())
    return info.changes > 0
  } catch (err) {
    captureError("[makegood] не удалось выдать право на перегенерацию:", err)
    return false
  }
}

/**
 * Неиспользованное право, покрывающее указанную глубину, или null.
 *
 * `ORDER BY credits ASC` — берётся МИНИМАЛЬНОЕ достаточное право: если у человека
 * есть право за провал быстрой и за провал глубокой генерации, то на быструю уйдёт
 * первое, а дорогое останется на дорогой запуск. Обратный порядок молча обесценивал
 * бы компенсацию.
 */
export function findMakegoodFor(userId: number, depth: GenerationDepth): MakegoodRight | null {
  try {
    const needed = GENERATION_DEPTHS[depth]?.credits ?? 0
    const row = db
      .prepare(
        `SELECT id, project_id as projectId, depth, credits, reason, created_at as createdAt
           FROM generation_makegoods
          WHERE user_id = ? AND consumed_at IS NULL AND credits >= ?
          ORDER BY credits ASC, id ASC
          LIMIT 1`,
      )
      .get(userId, needed) as MakegoodRight | undefined
    return row ?? null
  } catch {
    /* Таблицы нет (схема без 098) — прав нет. Смета и генерация работают как раньше. */
    return null
  }
}

/** Любое неиспользованное право — для сметы: показать человеку, что оно у него есть,
 *  ещё до выбора глубины. Возвращает самое старое (его и потратит первый подходящий запуск). */
export function openMakegood(userId: number): MakegoodRight | null {
  try {
    const row = db
      .prepare(
        `SELECT id, project_id as projectId, depth, credits, reason, created_at as createdAt
           FROM generation_makegoods
          WHERE user_id = ? AND consumed_at IS NULL
          ORDER BY id ASC
          LIMIT 1`,
      )
      .get(userId) as MakegoodRight | undefined
    return row ?? null
  } catch {
    return null
  }
}

/**
 * Помечает право использованным. Атомарно: `WHERE consumed_at IS NULL` + проверка
 * changes — два одновременных запуска не могут потратить одно право дважды (гонка
 * реальна: человек жмёт кнопку в двух вкладках).
 *
 * Возвращает false, если право уже израсходовано — вызывающий маршрут обязан
 * тогда списать плату обычным порядком, а не отдать генерацию бесплатно.
 */
export function consumeMakegood(makegoodId: number, consumedProjectId: number | null): boolean {
  try {
    const info = db
      .prepare(
        `UPDATE generation_makegoods SET consumed_at = ?, consumed_project_id = ?
          WHERE id = ? AND consumed_at IS NULL`,
      )
      .run(Date.now(), consumedProjectId, makegoodId)
    return info.changes > 0
  } catch (err) {
    captureError("[makegood] не удалось списать право на перегенерацию:", err)
    return false
  }
}

/**
 * Возвращает право владельцу: генерация, ради которой его списали, не состоялась.
 *
 * Симметрия возврату кредитов в POST /projects/generate. Без этого сбой создания
 * проекта сжигал бы компенсацию, то есть платформа промахнулась бы дважды и оба
 * раза за счёт пользователя.
 */
export function releaseMakegood(makegoodId: number): void {
  try {
    db.prepare(
      `UPDATE generation_makegoods SET consumed_at = NULL, consumed_project_id = NULL WHERE id = ?`,
    ).run(makegoodId)
  } catch (err) {
    captureError("[makegood] не удалось вернуть право на перегенерацию:", err)
  }
}

/** Привязывает уже списанное право к проекту, который на него сгенерирован —
 *  на момент списания id проекта ещё не существует. Только для аудита. */
export function attachMakegoodProject(makegoodId: number, projectId: number): void {
  try {
    db.prepare(`UPDATE generation_makegoods SET consumed_project_id = ? WHERE id = ?`).run(
      projectId,
      makegoodId,
    )
  } catch {
    /* Аудиторская мелочь: право уже списано корректно, привязка не критична. */
  }
}
