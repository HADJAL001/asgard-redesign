import {
  explainBuildIntegrity,
  repairIntegrity,
  formatDefectsForRepair,
  filesNeedingRegeneration,
  componentNameFor,
  type IntegrityCheck,
  type IntegrityDefect,
  type IntegrityReport,
  type RepairAction,
  type SourceFile,
} from "./build-integrity"
import { repairFileWithAi } from "../services/app-generator"
import { verifyBuildInSandbox } from "../services/sandbox.service"
import { lessonsFromBuildLog } from "./build-log-lessons"
import { captureError } from "./sentry"
import type { DesignBrief } from "./design-system"
import type { GenerationDepth } from "./generation-depths"

/* ================================================================
   OSGARD · Инженерный контур генерации
   ----------------------------------------------------------------
   ЗАЧЕМ. Джоб генерации (lib/project-generation.ts) ставил проекту
   `status = 'ready'`, НИ РАЗУ не проверив, что приложение вообще
   работоспособно: единственной проверкой был `ts.transpileModule`
   (синтаксис одного файла), а его результат просто складывался в
   `generation_error` — и проект всё равно объявлялся готовым. Битые
   импорты между параллельно сгенерированными файлами, забытая
   директива "use client", пакет, которого нет в package.json —
   всё это доезжало до пользователя со словом «готово».

   Контур замыкает цикл: ПРОВЕРКА → РЕМОНТ → ПОВТОРНАЯ ПРОВЕРКА →
   ЧЕСТНЫЙ ВЕРДИКТ.

     1. Разбор целостности (lib/build-integrity.ts) — детерминированно,
        в процессе, без Docker и npm install. Работает и в проде, где
        Docker-демона нет.
     2. Механический ремонт того, что чинится без домыслов (директива,
        недостающий default-экспорт, форма импорта, снятие несовместимой
        со статическим экспортом конструкции).
     3. AI-ремонт остатка: перегенерация ТОЛЬКО дефектных файлов со
        списком нарушений в промпте. Раунды ограничены глубиной
        генерации — дорогая глубина имеет право на большее число попыток.
     4. Опционально — реальная сборка `next build` в Docker-песочнице
        (services/sandbox.service). Там, где Docker есть, вердикт
        доказан сборкой; где нет — честно помечается как статический.

   ВЕРДИКТ НИКОГДА НЕ ВРЁТ (решение владельца продукта):
     passed     — чисто с первого разбора;
     repaired   — были дефекты, платформа их починила, финальный разбор чист;
     broken     — дефекты остались; проект всё равно доступен пользователю,
                  но несёт разбор и кнопку повторного ремонта;
     unverified — разбор невозможен (нет TypeScript в рантайме).

   Никогда не бросает наружу: любая внутренняя ошибка = вердикт по тому,
   что успели узнать. Генерация не имеет права падать из-за проверки.
   ================================================================ */

export type EngineeringVerdict = "passed" | "repaired" | "broken" | "unverified"

export type SandboxSummary = {
  ok: boolean
  skipped: boolean
  timedOut: boolean
  durationMs: number
  /** Хвост лога сборки — то, что реально сказал компилятор. */
  logTail: string
}

export type EngineeringReport = {
  verdict: EngineeringVerdict
  /** Чем доказана работоспособность: реальной сборкой или статическим разбором. */
  verifiedBy: "sandbox" | "static" | "none"
  checks: IntegrityCheck[]
  /** Остаточные дефекты (после всех попыток ремонта), с ограничением объёма. */
  defects: IntegrityDefect[]
  /** Что платформа реально сделала с кодом. */
  repairs: RepairAction[]
  /** Сколько дефектов уровня error было в момент первого разбора. */
  initialErrors: number
  /** Сколько раундов ремонта прошло (механический + AI). */
  attempts: number
  /** Правила, на которых генератор ошибся ИЗНАЧАЛЬНО — сырьё для самообучения
   *  платформы (lib/craft-corpus: частоты → блок «выученные уроки» в промпте). */
  lessons: Array<{ rule: string; count: number }>
  analyzedFiles: number
  sandbox?: SandboxSummary
  durationMs: number
  at: number
}

export type EngineeringOutcome = {
  files: SourceFile[]
  report: EngineeringReport
}

export type ContourProgress = {
  phase: "building" | "repairing"
  label: string
  /** Сколько дефектов известно на этот момент (для живого лога). */
  defects?: number
}

const MAX_DEFECTS_STORED = 40
const MAX_FILES_PER_ROUND = 4
const MAX_REPAIRS_STORED = 40

/** Сколько раундов AI-ремонта допускает глубина генерации. */
function aiRoundsFor(depth: GenerationDepth): number {
  return depth === "deep" ? 3 : depth === "standard" ? 2 : 1
}

/**
 * Нужна ли реальная сборка в песочнице. По умолчанию — только на самой дорогой
 * глубине: сборка занимает минуты и требует Docker, которого в облачном рантайме
 * (Railway) нет. `OSGARD_VERIFY_BUILD=1` включает принудительно (self-hosted
 * воркер с Docker), `0` — выключает совсем.
 */
export function shouldVerifyBuild(depth: GenerationDepth): boolean {
  const flag = process.env.OSGARD_VERIFY_BUILD
  if (flag === "1") return true
  if (flag === "0") return false
  return depth === "deep"
}

function errorsOf(report: IntegrityReport): IntegrityDefect[] {
  return report.defects.filter((d) => d.severity === "error")
}

/** Частоты правил — сырьё памяти ошибок платформы (lib/craft-corpus). */
function countRules(defects: IntegrityDefect[]): Array<{ rule: string; count: number }> {
  const counts = new Map<string, number>()
  for (const defect of defects) counts.set(defect.rule, (counts.get(defect.rule) ?? 0) + 1)
  return [...counts.entries()]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
}

/** Добавляет уроки, которые статический разбор не увидел, но увидел компилятор —
 *  ровно тот сигнал, который волна 7 п.2 перестаёт выбрасывать. Учим на ПЕРВОМ
 *  провале сборки, до AI-ремонта: после ремонта причина уже могла исчезнуть. */
function mergeLessons(
  base: Array<{ rule: string; count: number }>,
  extra: Array<{ rule: string; count: number }>,
): Array<{ rule: string; count: number }> {
  const counts = new Map(base.map((l) => [l.rule, l.count]))
  for (const l of extra) counts.set(l.rule, (counts.get(l.rule) ?? 0) + l.count)
  return [...counts.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count)
}

/** Короткая человеческая сводка вердикта — уезжает в generation_error и в UI. */
export function summarizeVerdict(report: EngineeringReport): string | null {
  if (report.verdict !== "broken") return null
  const errors = report.defects.filter((d) => d.severity === "error")
  const rules = [...new Set(errors.map((d) => d.rule))].slice(0, 4).join(", ")
  return `Инженерная проверка нашла ${errors.length} нерешённых дефекта(ов): ${rules}. Разбор — во вкладке «Инженерия», можно запустить повторный ремонт.`
}

/**
 * Прогоняет набор файлов через инженерный контур и возвращает исправленный набор
 * вместе с честным отчётом. Единственная точка, где решается вердикт проекта.
 */
export async function runEngineeringContour(
  input: SourceFile[],
  opts: {
    name: string
    hint?: string
    brief: DesignBrief
    depth: GenerationDepth
    /** Живой прогресс для SSE-лога генерации. */
    onProgress?: (p: ContourProgress) => void
    /** Метка для логов песочницы. */
    logLabel?: string
  },
): Promise<EngineeringOutcome> {
  const startedAt = Date.now()
  let files = input
  const repairs: RepairAction[] = []
  let attempts = 0
  /** Уроки берём из ПЕРВОГО разбора: учить платформу надо на том, что генератор
   *  сделал не так, а не на том, что осталось после ремонта. */
  let lessons: Array<{ rule: string; count: number }> = []

  const finish = (
    report: IntegrityReport,
    verdict: EngineeringVerdict,
    verifiedBy: EngineeringReport["verifiedBy"],
    initialErrors: number,
    sandbox?: SandboxSummary,
  ): EngineeringOutcome => ({
    files,
    report: {
      verdict,
      verifiedBy,
      checks: report.checks,
      defects: report.defects.slice(0, MAX_DEFECTS_STORED),
      repairs: repairs.slice(0, MAX_REPAIRS_STORED),
      initialErrors,
      attempts,
      lessons,
      analyzedFiles: report.analyzedFiles,
      sandbox,
      durationMs: Date.now() - startedAt,
      at: Date.now(),
    },
  })

  try {
    opts.onProgress?.({ phase: "building", label: "Проверяю работоспособность приложения" })

    let report = explainBuildIntegrity(files)

    // Разбор физически невозможен — честное «не проверено», а не ложное «готово».
    if (!report.analyzed) {
      return finish(report, "unverified", "none", 0)
    }

    const initialErrors = errorsOf(report).length
    lessons = countRules(errorsOf(report))

    if (initialErrors === 0) {
      const verified = await maybeVerifyBuild(files, opts)
      if (verified && !verified.skipped && !verified.ok) {
        // Сборка сказала «нет» там, где статический разбор сказал «да» — доверяем сборке.
        lessons = mergeLessons(lessons, lessonsFromBuildLog(verified.logTail))
        const afterBuild = await repairFromBuildLog(files, verified, opts, repairs)
        files = afterBuild.files
        attempts += afterBuild.rounds
        const reReport = explainBuildIntegrity(files)
        const reVerified = afterBuild.rounds > 0 ? await maybeVerifyBuild(files, opts) : verified
        const ok = !!reVerified?.ok
        return finish(
          reReport,
          ok ? (repairs.length > 0 ? "repaired" : "passed") : "broken",
          "sandbox",
          initialErrors,
          reVerified ?? verified,
        )
      }
      return finish(
        report,
        "passed",
        verified && !verified.skipped ? "sandbox" : "static",
        initialErrors,
        verified ?? undefined,
      )
    }

    /* --- Раунд 0: механический ремонт (бесплатный, без AI) --- */
    opts.onProgress?.({
      phase: "repairing",
      label: "Чиню найденные дефекты",
      defects: initialErrors,
    })
    const mechanical = repairIntegrity(files, report)
    if (mechanical.actions.length > 0) {
      files = mechanical.files
      repairs.push(...mechanical.actions)
      attempts += 1
      report = explainBuildIntegrity(files)
    }

    /* --- Раунды AI-ремонта: перегенерируем только дефектные файлы --- */
    const maxRounds = aiRoundsFor(opts.depth)
    for (let round = 0; round < maxRounds && errorsOf(report).length > 0; round++) {
      const changed = await aiRepairRound(files, report, opts, repairs)
      if (!changed.changedAny) break

      files = changed.files
      attempts += 1

      // После AI повторяем механический проход: модель часто чинит логику,
      // но снова забывает директиву или default-экспорт.
      let next = explainBuildIntegrity(files)
      const mech = repairIntegrity(files, next)
      if (mech.actions.length > 0) {
        files = mech.files
        repairs.push(...mech.actions)
        next = explainBuildIntegrity(files)
      }
      report = next

      opts.onProgress?.({
        phase: "repairing",
        label: "Проверяю после ремонта",
        defects: errorsOf(report).length,
      })
    }

    const remaining = errorsOf(report).length

    /* --- Реальная сборка (там, где доступна) --- */
    const verified = remaining === 0 ? await maybeVerifyBuild(files, opts) : null

    if (remaining > 0) {
      return finish(report, "broken", "static", initialErrors)
    }

    if (verified && !verified.skipped && !verified.ok) {
      lessons = mergeLessons(lessons, lessonsFromBuildLog(verified.logTail))
      const afterBuild = await repairFromBuildLog(files, verified, opts, repairs)
      files = afterBuild.files
      attempts += afterBuild.rounds
      const reReport = explainBuildIntegrity(files)
      const reVerified = afterBuild.rounds > 0 ? await maybeVerifyBuild(files, opts) : verified
      return finish(
        reReport,
        reVerified?.ok ? "repaired" : "broken",
        "sandbox",
        initialErrors,
        reVerified ?? verified,
      )
    }

    return finish(
      report,
      repairs.length > 0 ? "repaired" : "passed",
      verified && !verified.skipped ? "sandbox" : "static",
      initialErrors,
      verified ?? undefined,
    )
  } catch (err) {
    captureError("[project-engineering] контур упал, отдаю честный неполный вердикт:", err)
    const report = explainBuildIntegrity(files)
    return finish(report, report.analyzed && report.ok ? "passed" : "broken", "static", 0)
  }
}

/* ----------------------------------------------------------------
   AI-ремонт
   ---------------------------------------------------------------- */

async function aiRepairRound(
  files: SourceFile[],
  report: IntegrityReport,
  opts: { name: string; hint?: string; brief: DesignBrief; onProgress?: (p: ContourProgress) => void },
  repairs: RepairAction[],
): Promise<{ files: SourceFile[]; changedAny: boolean }> {
  const targets = filesNeedingRegeneration(errorsOf(report)).slice(0, MAX_FILES_PER_ROUND)
  if (targets.length === 0) return { files, changedAny: false }

  const siblings = files.filter((f) => /\.(tsx?|css|json)$/.test(f.path)).map((f) => f.path)
  const byPath = new Map(files.map((f) => [f.path, f.content]))

  opts.onProgress?.({
    phase: "repairing",
    label: `Переписываю ${targets.length} файл(а) по списку дефектов`,
    defects: errorsOf(report).length,
  })

  const results = await Promise.all(
    targets.map(async (path) => {
      const current = byPath.get(path)
      if (current === undefined) return null
      const defects = formatDefectsForRepair(report.defects.filter((d) => d.file === path))
      if (!defects) return null

      const fixed = await repairFileWithAi({
        name: opts.name,
        hint: opts.hint,
        path,
        purpose: `компонент ${componentNameFor(path)}`,
        current,
        defects,
        brief: opts.brief,
        siblings,
      })
      return fixed && fixed !== current ? { path, content: fixed } : null
    }),
  )

  let changedAny = false
  for (const result of results) {
    if (!result) continue
    byPath.set(result.path, result.content)
    repairs.push({ rule: "ai-repair", file: result.path, action: "файл переписан AI по списку дефектов" })
    changedAny = true
  }

  return {
    files: files.map((f) => ({ path: f.path, content: byPath.get(f.path) ?? f.content })),
    changedAny,
  }
}

/* ----------------------------------------------------------------
   Реальная сборка
   ---------------------------------------------------------------- */

async function maybeVerifyBuild(
  files: SourceFile[],
  opts: { depth: GenerationDepth; logLabel?: string; onProgress?: (p: ContourProgress) => void },
): Promise<SandboxSummary | null> {
  if (!shouldVerifyBuild(opts.depth)) return null

  opts.onProgress?.({ phase: "building", label: "Собираю приложение в изолированной песочнице" })
  try {
    const result = await verifyBuildInSandbox(files, { logLabel: opts.logLabel ?? "contour-build" })
    return {
      ok: result.ok,
      skipped: result.skipped,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      logTail: result.logs.slice(-4000),
    }
  } catch (err) {
    captureError("[project-engineering] песочница недоступна:", err)
    return { ok: false, skipped: true, timedOut: false, durationMs: 0, logTail: "песочница недоступна" }
  }
}

/**
 * Сборка упала там, где статический разбор был чист — значит компилятор знает
 * что-то, чего не знает разбор. Скармливаем его лог тому же AI-ремонту: файл
 * выбираем по упоминанию пути в логе.
 */
async function repairFromBuildLog(
  files: SourceFile[],
  build: SandboxSummary,
  opts: { name: string; hint?: string; brief: DesignBrief; onProgress?: (p: ContourProgress) => void },
  repairs: RepairAction[],
): Promise<{ files: SourceFile[]; rounds: number }> {
  const mentioned = files
    .filter((f) => /\.tsx?$/.test(f.path) && build.logTail.includes(f.path))
    .slice(0, MAX_FILES_PER_ROUND)

  if (mentioned.length === 0) return { files, rounds: 0 }

  opts.onProgress?.({ phase: "repairing", label: "Чиню по логу реальной сборки" })

  const siblings = files.filter((f) => /\.(tsx?|css|json)$/.test(f.path)).map((f) => f.path)
  const byPath = new Map(files.map((f) => [f.path, f.content]))

  const results = await Promise.all(
    mentioned.map(async (file) => {
      const fixed = await repairFileWithAi({
        name: opts.name,
        hint: opts.hint,
        path: file.path,
        purpose: `компонент ${componentNameFor(file.path)}`,
        current: file.content,
        defects: `Реальная сборка next build завершилась ошибкой. Лог:\n${build.logTail.slice(-2000)}`,
        brief: opts.brief,
        siblings,
      })
      return fixed && fixed !== file.content ? { path: file.path, content: fixed } : null
    }),
  )

  let changed = false
  for (const result of results) {
    if (!result) continue
    byPath.set(result.path, result.content)
    repairs.push({ rule: "ai-repair-build", file: result.path, action: "файл переписан по логу реальной сборки" })
    changed = true
  }

  return {
    files: files.map((f) => ({ path: f.path, content: byPath.get(f.path) ?? f.content })),
    rounds: changed ? 1 : 0,
  }
}
