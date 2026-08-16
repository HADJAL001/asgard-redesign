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
