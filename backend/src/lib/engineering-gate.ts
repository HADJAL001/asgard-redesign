import db from "./db"
import { captureError } from "./sentry"

/* ================================================================
   OSGARD · Инженерный вердикт как ДОПУСК к публикации
   ----------------------------------------------------------------
   ЗАЧЕМ. Выстрел 30.07.2026 (деплой 82 проекта 35) показал разрыв:
   платформа САМА написала при генерации «Инженерная проверка нашла
   40 нерешённых дефекта(ов): prop-unknown, prop-type-mismatch» —
   и тут же предложила «Опубликовать» как обычное следующее действие.
   На кластере `npx next build` предсказуемо упал на 4 страницах из 9.

   Вердикт лежал в колонке build_status (миграция 091), но его никто
   не спрашивал: ручка деплоя проверяла только `status='ready'`, то
   есть «генерация закончилась», а не «приложение работает».

   Здесь вердикт становится допуском:
     • читаем сохранённый вердикт (readEngineeringGate);
     • деплой сломанного приложения требует ОСОЗНАННОГО подтверждения,
       а не одного клика по кнопке, выглядящей как «готово»;
     • реальная сборка на кластере, упавшая уже после публикации,
       возвращается в вердикт проекта (recordClusterBuildFailure) —
       компилятор кластера честнее нашего статического разбора, и его
       слово не имеет права потеряться в поле deploy_error.

   Ни одна функция здесь не бросает наружу: отсутствие колонок 091
   (старая схема) не имеет права ломать ни деплой, ни генерацию —
   тот же принцип, что и в persistEngineering (lib/project-generation).
   ================================================================ */

export type EngineeringGate = {
  /** Вердикт из build_status: passed | repaired | broken | unverified | null. */
  verdict: string | null
  /** Остаточные дефекты уровня error в сохранённом отчёте. */
  errorDefects: number
  /** Правила, на которых приложение осталось сломанным (для человеческого текста). */
  rules: string[]
}

export type ReleaseReadiness = {
  ready: boolean
  code: "build_not_verified" | "build_broken" | "design_not_verified" | "design_below_standard" | null
  message: string | null
}

export const PREMIUM_DESIGN_MINIMUM = 80

const EMPTY_GATE: EngineeringGate = { verdict: null, errorDefects: 0, rules: [] }

/** Читает сохранённый инженерный вердикт проекта. Никогда не бросает. */
export function readEngineeringGate(projectId: number): EngineeringGate {
  let row: { buildStatus: string | null; buildReport: string | null } | undefined
  try {
    row = db
      .prepare(`SELECT build_status as buildStatus, build_report as buildReport FROM projects WHERE id = ?`)
      .get(projectId) as typeof row
  } catch {
    // Схема без колонок 091 — вердикта нет, гейт молчит (а не запрещает всё подряд).
    return EMPTY_GATE
  }

  if (!row) return EMPTY_GATE

  let errorDefects = 0
  let rules: string[] = []
  if (row.buildReport) {
    try {
      const report = JSON.parse(row.buildReport) as {
        defects?: Array<{ severity?: string; rule?: string }>
      }
      const errors = (report.defects ?? []).filter((d) => d?.severity === "error")
      errorDefects = errors.length
      rules = [...new Set(errors.map((d) => d?.rule).filter((r): r is string => !!r))].slice(0, 4)
    } catch {
      // Битый JSON отчёта не отменяет сам вердикт — он в отдельной колонке.
    }
  }

  return { verdict: row.buildStatus ?? null, errorDefects, rules }
}

/**
 * Можно ли публиковать приложение без дополнительного подтверждения.
 * Блокируем ТОЛЬКО доказанно сломанное (`broken`): «не проверено» и отсутствие
 * вердикта — не повод запрещать (проверка, срабатывающая всегда, ничего не проверяет).
 */
export function deployNeedsAcknowledgement(gate: EngineeringGate): boolean {
  return gate.verdict === "broken"
}

/** A public release is allowed only after a real build and premium design review. */
export function readReleaseReadiness(projectId: number): ReleaseReadiness {
  try {
    const row = db.prepare(
      `SELECT build_status as buildStatus, build_report as buildReport, design_score as designScore FROM projects WHERE id = ?`,
    ).get(projectId) as { buildStatus: string | null; buildReport: string | null; designScore: number | null } | undefined
    if (!row) return { ready: false, code: "build_not_verified", message: "Проект не найден" }
    if (row.buildStatus === "broken") return { ready: false, code: "build_broken", message: "Сборка проекта не проходит. Сначала запустите ремонт." }
    if (typeof row.designScore !== "number") return { ready: false, code: "design_not_verified", message: "Перед публикацией нужна проверка дизайна проекта." }
    if (row.designScore < PREMIUM_DESIGN_MINIMUM) {
      return { ready: false, code: "design_below_standard", message: `Дизайн набрал ${row.designScore}/100. Для публикации требуется не менее ${PREMIUM_DESIGN_MINIMUM}/100.` }
    }
    let verifiedBy: string | undefined
    try { verifiedBy = row.buildReport ? JSON.parse(row.buildReport)?.verifiedBy : undefined } catch { /* invalid report is not proof */ }
    if (!(["passed", "repaired"].includes(row.buildStatus ?? "") && (verifiedBy === "sandbox" || verifiedBy === "cluster-build"))) {
      return { ready: false, code: "build_not_verified", message: "Перед публикацией нужна успешная реальная сборка в изолированной среде." }
    }
    return { ready: true, code: null, message: null }
  } catch {
    return { ready: false, code: "build_not_verified", message: "Проверка готовности к публикации недоступна." }
  }
}

/** Человеческая причина отказа — тот же язык, что в сводке вердикта. */
export function describeBrokenGate(gate: EngineeringGate): string {
  const rules = gate.rules.length > 0 ? `: ${gate.rules.join(", ")}` : ""
  const count = gate.errorDefects > 0 ? `${gate.errorDefects} ` : ""
  return (
    `Приложение не собирается — инженерная проверка нашла ${count}нерешённых дефекта(ов)${rules}. ` +
    `Сначала «Починить», иначе публикация выложит в интернет неработающую версию.`
  )
}

/**
 * Реальная сборка приложения упала — записываем это в инженерный вердикт.
 *
 * Раньше провал `next build` жил только в deploy_error: проект продолжал
 * показывать «Проверено» и предлагать публикацию, хотя настоящий компилятор
 * уже сказал «нет». Компилятор — самый честный учитель, его слово должно
 * доезжать до вердикта, а не теряться в тексте ошибки деплоя.
 *
 * Отчёт не затираем: дополняем существующий полем realBuild и меняем вердикт
 * на broken с verifiedBy='real-build' — доказательство сборкой сильнее
 * статического разбора, каким бы чистым тот ни был.
 */
export function recordRealBuildFailure(
  projectId: number,
  input: { source: "cluster" | "host"; status: string; message: string; at?: number },
): void {
  const at = input.at ?? Date.now()
  try {
    const row = db.prepare(`SELECT build_report as buildReport FROM projects WHERE id = ?`).get(projectId) as
      | { buildReport: string | null }
      | undefined

    let report: Record<string, unknown> = {}
    if (row?.buildReport) {
      try {
        const parsed = JSON.parse(row.buildReport)
        if (parsed && typeof parsed === "object") report = parsed as Record<string, unknown>
      } catch {
        report = {}
      }
    }

    report.verifiedBy = "real-build"
    report.realBuild = {
      ok: false,
      source: input.source,
      status: input.status,
      message: input.message.slice(0, 2000),
      at,
    }

    db.prepare(
      `UPDATE projects SET build_status = 'broken', build_report = ?, build_verified_at = ? WHERE id = ?`,
    ).run(JSON.stringify(report), at, projectId)
  } catch (err) {
    // Схема без колонок 091 либо гонка с генерацией — деплой из-за этого не падает.
    captureError("[engineering-gate] не удалось записать вердикт по реальной сборке:", err)
  }
}

/** Stores the cluster's successful Docker build and live health check as release evidence. */
export function recordClusterBuildSuccess(projectId: number, input: { status: string; at?: number }): void {
  const at = input.at ?? Date.now()
  try {
    const row = db.prepare(`SELECT build_report as buildReport FROM projects WHERE id = ?`).get(projectId) as
      | { buildReport: string | null }
      | undefined
    let report: Record<string, unknown> = {}
    if (row?.buildReport) {
      try {
        const parsed = JSON.parse(row.buildReport)
        if (parsed && typeof parsed === "object") report = parsed as Record<string, unknown>
      } catch {
        report = {}
      }
    }
    report.verifiedBy = "cluster-build"
    report.clusterBuild = { ok: true, status: input.status, at }
    db.prepare(
      `UPDATE projects SET build_status = 'passed', build_report = ?, build_verified_at = ? WHERE id = ?`,
    ).run(JSON.stringify(report), at, projectId)
  } catch (err) {
    captureError("[engineering-gate] failed to record cluster build verdict:", err)
  }
}
