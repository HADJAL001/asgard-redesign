"use client"

/* ================================================================
   ProjectEngineeringPanel — честный инженерный вердикт приложения
   ----------------------------------------------------------------
   Показывает то, чего платформа раньше не знала о собственных
   генерациях: работает ли сгенерированный код. До миграции 091 проект
   получал `status = 'ready'` сразу после записи файлов — единственной
   проверкой был ts.transpileModule (синтаксис ОДНОГО файла в отрыве от
   остальных), а его результат никак не влиял на статус.

   Здесь четыре честных блока:
   • Вердикт — passed / repaired / broken / unverified, и чем он доказан
     (статический разбор целостности или реальная сборка в песочнице).
   • Проверки — граф модулей, граница клиент/сервер, контракт
     статического экспорта, маршруты, чистота исходников.
   • Журнал ремонта — что именно платформа починила сама.
   • Остаточные дефекты — с файлом, строкой и человеческим объяснением,
     плюс кнопка повторного ремонта.

   Данные: GET /projects/:id/engineering (только владельцу). Проекты,
   сгенерированные до контура, честно отвечают verified:false — вердикт
   задним числом им НЕ приписывается.
   ================================================================ */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Hammer, Loader2, ShieldCheck, Wrench, XCircle } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { COLORS } from "@/lib/economy"

type Verdict = "passed" | "repaired" | "broken" | "unverified"

type Check = { key: string; label: string; passed: boolean; errors: number; warnings: number; detail: string }
type Defect = { rule: string; severity: "error" | "warn"; file: string; line?: number; message: string; autoFixable: boolean }
type Repair = { rule: string; file: string; action: string }

type EngineeringReport = {
  verifiedBy: "sandbox" | "static" | "none"
  checks: Check[]
  defects: Defect[]
  repairs: Repair[]
  initialErrors: number
  attempts: number
  analyzedFiles: number
  sandbox?: { ok: boolean; skipped: boolean; timedOut: boolean; durationMs: number; logTail: string }
  durationMs: number
}

type EngineeringResponse = {
  verified: boolean
  verdict: Verdict | null
  report: EngineeringReport | null
  verifiedAt: number | null
}

const VERDICT_VIEW: Record<Verdict, { label: string; hint: string; color: string; Icon: typeof ShieldCheck }> = {
  passed: {
    label: "Проверено",
    hint: "Приложение прошло инженерную проверку без единого дефекта.",
    color: "#2ECC71",
    Icon: ShieldCheck,
  },
  repaired: {
    label: "Починено",
    hint: "Дефекты были найдены и исправлены платформой — финальная проверка чистая.",
    color: "#2ECC71",
    Icon: Wrench,
  },
  broken: {
    label: "Есть дефекты",
    hint: "Часть дефектов не удалось починить автоматически. Код доступен, но сборка приложения упадёт.",
    color: "#E74C3C",
    Icon: XCircle,
  },
  unverified: {
    label: "Не проверено",
    hint: "Разбор целостности не выполнялся — вердикта нет.",
    color: "#F1C40F",
    Icon: AlertTriangle,
  },
}

const VERIFIED_BY_TEXT: Record<EngineeringReport["verifiedBy"], string> = {
  sandbox: "доказано реальной сборкой next build в изолированной песочнице",
  static: "доказано статическим разбором целостности (граф модулей, границы, контракт экспорта)",
  none: "проверка не выполнялась",
}

type PanelState =
  | { status: "loading"; forId: number }
  | { status: "error"; forId: number; message: string }
  | { status: "ready"; forId: number; data: EngineeringResponse }

export function ProjectEngineeringPanel({
  projectId,
  onRepairStarted,
}: {
  projectId: number
  /** Ремонт запущен — страница переводит проект в живой лог (тот же SSE, что у генерации). */
  onRepairStarted?: () => void
}) {
  const [state, setState] = useState<PanelState>({ status: "loading", forId: projectId })
  const [repairing, setRepairing] = useState(false)
  const [repairError, setRepairError] = useState<string | null>(null)

  const load = useCallback(
    (signal: { cancelled: boolean }) => {
      apiClient
        .get<EngineeringResponse>(`/projects/${projectId}/engineering`)
        .then((res) => {
          if (!signal.cancelled) setState({ status: "ready", forId: projectId, data: res })
        })
        .catch((err: any) => {
          if (!signal.cancelled) {
            setState({ status: "error", forId: projectId, message: err?.message || "Не удалось загрузить инженерный отчёт" })
          }
        })
    },
    [projectId],
  )

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => {
      signal.cancelled = true
    }
  }, [load])

  const startRepair = async () => {
    setRepairing(true)
    setRepairError(null)
    try {
      await apiClient.post(`/projects/${projectId}/repair`, {})
      onRepairStarted?.()
    } catch (err: any) {
      setRepairError(err?.message || "Не удалось запустить ремонт")
    } finally {
      setRepairing(false)
    }
  }

  const loading = state.status === "loading" || state.forId !== projectId
  const error = state.status === "error" && state.forId === projectId ? state.message : null
  const data = state.status === "ready" && state.forId === projectId ? state.data : null

  if (loading) {
    return (
      <div
        className="mt-6 flex items-center justify-center gap-3 rounded-2xl px-6 py-16"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <Loader2 size={18} className="animate-spin" style={{ color: COLORS.accent }} />
        <p className="text-[13px]" style={{ color: COLORS.label }}>Загружаю инженерный отчёт…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="mt-6 flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center"
        style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      >
        <AlertTriangle size={28} strokeWidth={1.25} style={{ color: "#E74C3C" }} />
        <p className="text-[13px]" style={{ color: COLORS.label }}>{error}</p>
      </div>
    )
  }

  // Проект сгенерирован до появления контура — вердикта у него нет и выдумывать его нечестно.
  if (!data?.verified || !data.verdict) {
    return (
      <div
        className="mt-6 flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center"
        style={{ backgroundColor: COLORS.card, border: `1px dashed ${COLORS.border}` }}
      >
        <Hammer size={30} strokeWidth={1.25} style={{ color: COLORS.label }} />
        <p className="max-w-[460px] text-[14px]" style={{ color: COLORS.label }}>
          Инженерная проверка для этого проекта не проводилась — он сгенерирован до её появления.
          Можно запустить её сейчас: платформа разберёт код, починит что сможет и вынесет вердикт.
        </p>
        <button
          type="button"
          onClick={startRepair}
          disabled={repairing}
          className="rounded-xl px-4 py-2 text-[13px] font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: COLORS.accent, color: "#05070E" }}
        >
          {repairing ? "Запускаю…" : "Проверить и починить"}
        </button>
        {repairError && <p className="text-[12px]" style={{ color: "#E74C3C" }}>{repairError}</p>}
      </div>
    )
  }

  const verdict = VERDICT_VIEW[data.verdict] ?? VERDICT_VIEW.unverified
  const report = data.report
  const errors = report?.defects.filter((d) => d.severity === "error") ?? []
  const VerdictIcon = verdict.Icon

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Вердикт */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <VerdictIcon size={26} strokeWidth={1.5} style={{ color: verdict.color, flexShrink: 0 }} />
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Инженерный вердикт</p>
              <p className="mt-1 text-[18px] font-medium" style={{ color: verdict.color }}>{verdict.label}</p>
              <p className="mt-1 max-w-[520px] text-[13px]" style={{ color: COLORS.label }}>{verdict.hint}</p>
            </div>
          </div>

          {data.verdict === "broken" && (
            <button
              type="button"
              onClick={startRepair}
              disabled={repairing}
              className="rounded-xl px-4 py-2 text-[13px] font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: COLORS.accent, color: "#05070E" }}
            >
              {repairing ? "Запускаю…" : "Починить ещё раз"}
            </button>
          )}
        </div>

        {report && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px]" style={{ color: COLORS.label }}>
            <span>{VERIFIED_BY_TEXT[report.verifiedBy]}</span>
            <span>Файлов разобрано: {report.analyzedFiles}</span>
            {report.initialErrors > 0 && <span>Найдено при генерации: {report.initialErrors}</span>}
            {report.attempts > 0 && <span>Раундов ремонта: {report.attempts}</span>}
          </div>
        )}

        {repairError && <p className="mt-3 text-[12px]" style={{ color: "#E74C3C" }}>{repairError}</p>}
      </div>

      {/* Проверки */}
      {report && report.checks.length > 0 && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Что проверено</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {report.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2.5 text-[13px]">
                {check.passed ? (
                  <CheckCircle2 size={15} style={{ color: "#2ECC71", flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <XCircle size={15} style={{ color: "#E74C3C", flexShrink: 0, marginTop: 2 }} />
                )}
                <span>
                  {check.label}
                  <span className="ml-2 text-[12px]" style={{ color: COLORS.label }}>{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Журнал ремонта */}
      {report && report.repairs.length > 0 && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Что платформа починила сама</p>
          <ul className="mt-3 flex flex-col gap-2">
            {report.repairs.map((repair, i) => (
              <li key={`${repair.file}-${repair.rule}-${i}`} className="flex items-start gap-2.5 text-[13px]">
                <Wrench size={14} style={{ color: COLORS.accent, flexShrink: 0, marginTop: 3 }} />
                <span>
                  <span className="font-mono text-[12px]" style={{ color: COLORS.label }}>{repair.file}</span>
                  <span className="ml-2">{repair.action}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Остаточные дефекты */}
      {errors.length > 0 && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Нерешённые дефекты</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {errors.map((defect, i) => (
              <li key={`${defect.file}-${defect.rule}-${i}`} className="text-[13px]">
                <span className="font-mono text-[12px]" style={{ color: "#E74C3C" }}>
                  {defect.file}
                  {defect.line ? `:${defect.line}` : ""}
                </span>
                <span className="ml-2">{defect.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Лог реальной сборки */}
      {report?.sandbox && !report.sandbox.skipped && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>
            Реальная сборка · {(report.sandbox.durationMs / 1000).toFixed(1)}с
            {report.sandbox.timedOut ? " · превышено время" : ""}
          </p>
          <pre
            className="mt-3 max-h-[220px] overflow-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed"
            style={{ backgroundColor: "rgba(0,0,0,0.35)", color: COLORS.label }}
          >
            {report.sandbox.logTail || "лог пуст"}
          </pre>
        </div>
      )}
    </div>
  )
}
