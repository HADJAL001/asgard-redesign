import db from "./db"
import { FREE_REFINEMENTS_GRANT } from "./refinements"

/* ================================================================
   OSGARD · Человеческие сигналы в качество корпуса (волна 7, п.2)
   ----------------------------------------------------------------
   Качество шаблона (lib/craft-corpus.craftQuality) до этой волны было
   производным ТОЛЬКО от машины: вердикт сборки × балл интерфейса −
   цена ремонтов. Машина умеет отвечать «скомпилировалось», но не
   умеет отвечать «годится человеку». Из-за этого корпус отбирал
   шаблоны, которые собираются, и был слеп к тому, что с ними
   происходило дальше у живого человека.

   Два человеческих сигнала у платформы уже были — и оба молчали:

     ОТРИЦАТЕЛЬНЫЙ — «попросил переделать» (`project_refinements`,
     миграция 089). Человек платит кредитами за то, чтобы исправить
     выданное. Каждая доработка — признание, что результат не
     подошёл, независимо от вердикта сборки.

     ПОЛОЖИТЕЛЬНЫЙ — «задеплоил» (`projects.deploy_status='deployed'`,
     миграция 029). Человек выложил результат наружу под своим
     именем. Сильнее «годится» платформа не увидит.

   ТРИ ПРАВИЛА, БЕЗ КОТОРЫХ ЭТО СТАЛО БЫ ВРАНЬЁМ.

   1. Дельта ПРОИЗВОДНА от живых счётчиков и считается в момент
      чтения. Ни одного накопительного поля «человеческое качество»:
      накопленный балл нельзя перепроверить, и он расходится с
      фактами молча (проект передеплоили — а поле помнит старое).

   2. Отсутствие сигнала — НЕ штраф. Шаблон без проекта-родителя
      (весь корпус до миграции 100) и проект, который просто не
      деплоили, получают дельту 0. Иначе «человеческий сигнал»
      выродился бы в поголовный штраф за отсутствие данных и
      перетряхнул бы корпус, ничего о нём не узнав.

   3. Дельта применяется только к ИЗМЕРЕННОМУ качеству
      (`quality_score IS NOT NULL`). Человеческий энтузиазм не имеет
      права поднимать код, который платформа не проверяла: сначала
      «работает», и только потом «понравилось».

   Одна и та же арифметика нужна и в TypeScript (тесты, витрина), и в
   SQL (отбор шаблона идёт по всей таблице, а не по топ-1, поэтому
   считать в JS нечего — сортировать нужно в запросе). Чтобы две
   реализации не разъехались, SQL-выражение СОБИРАЕТСЯ здесь же, из
   тех же констант.

   Все обращения к БД ленивые, внутри функций (урок инцидента #59).
   ================================================================ */

/** Бонус за деплой. Порядок величины — один шаг балла интерфейса: сигнал сильный,
 *  но он не должен перебивать инженерный вердикт (тот и так множитель качества). */
export const DEPLOY_BONUS = 8

/** Штраф за каждую доработку проекта. */
export const REFINEMENT_PENALTY = 4

/** Потолок штрафа: бесплатный грант доработок (3) × штраф. Дальше штраф не растёт —
 *  человек, который доводит проект десятью итерациями, вовлечён, а не обманут, и
 *  корпус не должен из-за этого объявлять шаблон негодным. */
export const REFINEMENT_PENALTY_CAP = FREE_REFINEMENTS_GRANT * REFINEMENT_PENALTY

export type HumanSignals = {
  /** Проект, из генерации которого сохранён шаблон. NULL = сигнала нет вовсе. */
  sourceProjectId: number | null
  /** Человек выложил результат наружу (deploy_status='deployed'). */
  deployed: boolean
  /** Сколько раз человек просил переделать этот проект. */
  refinements: number
}

/**
 * Человеческая дельта к качеству шаблона, в тех же единицах, что балл корпуса.
 *
 * Ноль без родителя — это не заглушка, а требование: см. правило 2 в шапке файла.
 */
export function humanQualityDelta(signals: HumanSignals): number {
  if (signals.sourceProjectId === null || signals.sourceProjectId === undefined) return 0

  const bonus = signals.deployed ? DEPLOY_BONUS : 0
  const penalty = Math.min(REFINEMENT_PENALTY_CAP, Math.max(0, signals.refinements) * REFINEMENT_PENALTY)

  return bonus - penalty
}

/**
 * Итоговое качество шаблона: машинный балл ± человеческая дельта, 0..100.
 *
 * `base === null` (корпус до миграции 092) означает «качество не измерялось» —
 * применять человеческий сигнал не к чему, возвращаем 0 как и раньше.
 */
export function effectiveTemplateQuality(base: number | null, signals: HumanSignals): number {
  if (base === null || base === undefined) return 0
  return Math.max(0, Math.min(100, base + humanQualityDelta(signals)))
}

/** SQL-выражение человеческой дельты — та же арифметика и те же константы, что выше.
 *
 *  `alias` — как в запросе называется таблица шаблонов: `t` в обычном SELECT и
 *  `project_templates` внутри `ON CONFLICT DO UPDATE ... WHERE` (там алиасы
 *  недоступны). Коррелированные подзапросы, а не JOIN — выражение обязано
 *  подставляться в любой из двух контекстов без переписывания запроса. */
export function humanDeltaSql(alias = "t"): string {
  return `(CASE
    WHEN ${alias}.source_project_id IS NULL OR ${alias}.quality_score IS NULL THEN 0
    ELSE
      (CASE WHEN (SELECT p.deploy_status FROM projects p WHERE p.id = ${alias}.source_project_id) = 'deployed'
            THEN ${DEPLOY_BONUS} ELSE 0 END)
      - MIN(${REFINEMENT_PENALTY_CAP},
            COALESCE((SELECT COUNT(*) FROM project_refinements r WHERE r.project_id = ${alias}.source_project_id), 0)
            * ${REFINEMENT_PENALTY})
  END)`
}

/** Итоговое качество в SQL: машинный балл (NULL → 0) плюс дельта. Не ограничиваем
 *  0..100 — это выражение только для СОРТИРОВКИ, а зажим потолком склеил бы
 *  различимые шаблоны в ничью. Наружу отдаётся зажатое (effectiveTemplateQuality). */
export function effectiveQualitySql(alias = "t"): string {
  return `(COALESCE(${alias}.quality_score, 0) + ${humanDeltaSql(alias)})`
}

/** Читает живые человеческие сигналы проекта. Никогда не бросает: отбор шаблона
 *  не имеет права падать из-за схемы без миграции 029/089. */
export function readHumanSignals(sourceProjectId: number | null): HumanSignals {
  if (sourceProjectId === null || sourceProjectId === undefined) {
    return { sourceProjectId: null, deployed: false, refinements: 0 }
  }

  let deployed = false
  let refinements = 0

  try {
    const row = db.prepare(`SELECT deploy_status FROM projects WHERE id = ?`).get(sourceProjectId) as
      | { deploy_status: string | null }
      | undefined
    deployed = row?.deploy_status === "deployed"
  } catch {
    /* Схема без 029 — сигнала «задеплоил» просто нет. */
  }

  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM project_refinements WHERE project_id = ?`)
      .get(sourceProjectId) as { n: number } | undefined
    refinements = row?.n ?? 0
  } catch {
    /* Схема без 089 — сигнала «попросил переделать» просто нет. */
  }

  return { sourceProjectId, deployed, refinements }
}

export type HumanSignalsReport = {
  /** Всего шаблонов в корпусе. */
  templates: number
  /** У скольких есть проект-родитель (только у них человеческий сигнал возможен). */
  linked: number
  /** У скольких родитель задеплоен человеком. */
  deployed: number
  /** У скольких родителя просили переделать хотя бы раз. */
  refined: number
  /** Сколько шаблонов человеческий сигнал поднял / опустил в отборе. */
  lifted: number
  penalized: number
  /** Доля корпуса, до которой человеческий сигнал вообще доходит, 0..1.
   *  `null` — корпус пуст (отличать от «сигнал не доходит ни до чего»). */
  signalShare: number | null
}

/** Витрина: доходит ли человеческий сигнал до отбора и до скольких шаблонов.
 *
 *  Без этого числа «в качество добавлены человеческие сигналы» — утверждение про
 *  код, а не наблюдаемый факт: в проде корпус может целиком состоять из шаблонов
 *  без родителя, и механизм будет честно менять ноль решений. */
export function humanSignalsReport(): HumanSignalsReport {
  const empty: HumanSignalsReport = {
    templates: 0,
    linked: 0,
    deployed: 0,
    refined: 0,
    lifted: 0,
    penalized: 0,
    signalShare: null,
  }

  try {
    const rows = db
      .prepare(`SELECT id, quality_score, source_project_id FROM project_templates`)
      .all() as Array<{ id: number; quality_score: number | null; source_project_id: number | null }>

    if (rows.length === 0) return empty

    const report: HumanSignalsReport = { ...empty, templates: rows.length, signalShare: 0 }

    for (const row of rows) {
      const signals = readHumanSignals(row.source_project_id)
      if (signals.sourceProjectId === null) continue

      report.linked += 1
      if (signals.deployed) report.deployed += 1
      if (signals.refinements > 0) report.refined += 1

      /* Дельта важна не сама по себе, а только если она меняет отбор — а меняет она
         его лишь у шаблонов с измеренным качеством (правило 3). */
      if (row.quality_score === null) continue
      const delta = humanQualityDelta(signals)
      if (delta > 0) report.lifted += 1
      if (delta < 0) report.penalized += 1
    }

    report.signalShare = report.templates === 0 ? null : (report.lifted + report.penalized) / report.templates
    return report
  } catch {
    /* Схема без корпуса — витрина честно нулевая, а не сломанная. */
    return empty
  }
}
