"use client"

/* ================================================================
   ProjectWorkspaceView — «Мастерская» проекта
   ----------------------------------------------------------------
   Почему она появилась (прямая жалоба пользователя): «после создания
   приложения непонятно, куда оно идёт; при клике выходит окно проекта,
   а мы должны попасть ВНУТРЬ проекта».

   Так и было: после генерации человек попадал на /projects/:id —
   страницу, где первым экраном идут артефакты и экономика (Артефактов /
   Продано / Доход), а само ПРИЛОЖЕНИЕ спрятано за мелкими вкладками.
   Вкладка «Запуск» вообще была заглушкой с кнопкой, ведущей на ЕЩЁ ОДНУ
   страницу (/projects/:id/live) — то есть код и запуск жили на разных
   роутах и никогда не были видны одновременно.

   Мастерская собирает всё в один экран:
     файлы + Monaco  |  живой запуск (WebContainer)  |  чат с Клодом
   и показывает КОНВЕЙЕР сборки — кто именно и что сейчас делает:
     Замысел → Клод пишет код → Компилятор проверяет → Запуск в браузере → Деплой
   Состояния конвейера берутся из РЕАЛЬНЫХ сигналов (SSE-стадии генерации,
   ошибки tsc при сохранении, реальная сборка в песочнице, состояние
   WebContainer, deployStatus), а не рисуются для красоты.

   Кросс-origin изоляция (COOP/COEP) для WebContainer выдана этому роуту
   в next.config.mjs. COEP=credentialless — поэтому Monaco с CDN грузится
   на том же экране (это уже доказано роутом /studio, где Monaco и
   WebContainer соседствуют).
   ================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Editor from "@monaco-editor/react"
import {
  ArrowLeft, FileCode2, Save, Loader2, AlertTriangle, CheckCircle2, Hammer, Play,
  RefreshCw, ExternalLink, Rocket, Send, Sparkles, Wand2, Boxes, Lightbulb, Bot,
  XCircle, Download, PanelsTopLeft, Coins,
} from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { API_BASE_URL, apiClient } from "@/lib/api-client"
import { useProjectGenerationStream } from "@/hooks/useProjectGenerationStream"
import { runInWebContainer, syncFileToPreview } from "@/lib/integrations/webcontainer"

/** Цена доработки в кредитах после гранта. Паритет с backend/src/lib/refinements.ts. */
const REFINEMENT_CREDIT_COST = 20
const REFINE_PROMPT_MAX = 2000

type RunState = "idle" | "starting" | "ready" | "error"
type StepState = "idle" | "active" | "done" | "error"
type Pane = "code" | "preview"

function languageForPath(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript"
  if (path.endsWith(".jsx") || path.endsWith(".js")) return "javascript"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".md")) return "markdown"
  return "plaintext"
}

const STEP_COLOR: Record<StepState, string> = {
  idle: COLORS.label,
  active: COLORS.accent,
  done: COLORS.green,
  error: COLORS.red,
}

export function ProjectWorkspaceView({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const router = useRouter()
  const {
    currentProject,
    currentProjectFiles,
    currentProjectRefinements,
    refinementsRemaining,
    fetchProject,
    fetchProjectFiles,
    fetchProjectRefinements,
    saveProjectFile,
    refineProject,
    clearCurrentProject,
    deployProjectToNetlify,
    pollDeployStatus,
    loading,
    error,
  } = useOsgardStore()

  /* ---- редактор ---- */
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [saveFailure, setSaveFailure] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [hotReloaded, setHotReloaded] = useState(false)

  /* ---- компилятор (реальная сборка в песочнице) ---- */
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; skipped: boolean; logs: string } | null>(null)

  /* ---- живой запуск ---- */
  const [runState, setRunState] = useState<RunState>("idle")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [isolated, setIsolated] = useState<boolean | null>(null)

  /* ---- чат с Клодом (доработки) ---- */
  const [prompt, setPrompt] = useState("")
  const [refining, setRefining] = useState(false)
  const [refineNotice, setRefineNotice] = useState<{ ok: boolean; message: string } | null>(null)

  /* ---- деплой ---- */
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  /* ---- мобильная раскладка: код или превью ---- */
  const [pane, setPane] = useState<Pane>("code")

  useEffect(() => {
    fetchProject(projectId, { skipAuthRedirect: true })
    fetchProjectFiles(projectId, { skipAuthRedirect: true })
    fetchProjectRefinements(projectId)
    // crossOriginIsolated доступен только в браузере после гидратации
    Promise.resolve().then(() =>
      setIsolated(typeof window !== "undefined" ? window.crossOriginIsolated === true : null),
    )
    return () => clearCurrentProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const isGenerating = currentProject?.status === "generating"

  /* Живой лог рождения/доработки приложения. На терминальной стадии тянем
     свежий проект, файлы и ленту правок — экран оживает без релоада. */
  const onGenerationDone = useCallback(() => {
    fetchProject(projectId, { skipAuthRedirect: true })
    fetchProjectFiles(projectId, { skipAuthRedirect: true })
    fetchProjectRefinements(projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
  const genStream = useProjectGenerationStream(projectId, isGenerating, onGenerationDone)

  /* Выбор файла: держим валидный выбор при любом обновлении списка. */
  useEffect(() => {
    Promise.resolve().then(() => {
      if (currentProjectFiles.length === 0) return setSelectedPath(null)
      if (!selectedPath || !currentProjectFiles.some((f) => f.path === selectedPath)) {
        // app/page.tsx — главная страница приложения; открываем её первой,
        // потому что именно её человек и хочет увидеть после генерации.
        const entry =
          currentProjectFiles.find((f) => f.path === "app/page.tsx") ?? currentProjectFiles[0]
        setSelectedPath(entry.path)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectFiles])

  const selectedFile = useMemo(
    () => currentProjectFiles.find((f) => f.path === selectedPath) ?? null,
    [currentProjectFiles, selectedPath],
  )

  useEffect(() => {
    Promise.resolve().then(() => {
      setDraft(selectedFile?.content ?? "")
      setSaveErrors([])
      setSaveFailure(null)
      setSavedAt(null)
      setHotReloaded(false)
    })
    // Только .path: сброс черновика нужен при СМЕНЕ файла, а не при фоновом
    // обновлении содержимого (иначе затёрли бы несохранённые правки).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile?.path])

  const dirty = selectedFile !== null && draft !== selectedFile.content

  /* ---------------- действия ---------------- */

  async function handleSave() {
    if (!selectedFile || !dirty || saving) return
    setSaving(true)
    setSaveFailure(null)
    setHotReloaded(false)
    try {
      const res = await saveProjectFile(projectId, selectedFile.path, draft)
      if (!res.success) {
        setSaveFailure(res.error || t("workspace.saveFailed"))
        return
      }
      setSaveErrors(res.errors || [])
      setSavedAt(Date.now())
      // Если превью уже поднято — доставляем правку горячо, без перезапуска.
      const synced = await syncFileToPreview(selectedFile.path, draft)
      setHotReloaded(synced)
    } finally {
      setSaving(false)
    }
  }

  async function handleVerifyBuild() {
    if (verifying) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await apiClient.post<{ ok: boolean; skipped: boolean; logs: string }>(
        `/projects/${projectId}/verify-build`,
      )
      setVerifyResult({ ok: res.ok, skipped: res.skipped, logs: res.logs || "" })
    } catch (err: any) {
      setVerifyResult({ ok: false, skipped: false, logs: err?.message || t("workspace.verifyFailed") })
    } finally {
      setVerifying(false)
    }
  }

  async function handleRun() {
    if (currentProjectFiles.length === 0 || runState === "starting") return
    setRunState("starting")
    setRunError(null)
    setPreviewUrl(null)
    setPane("preview")
    try {
      const url = await runInWebContainer(
        currentProjectFiles.map((f) => ({ path: f.path, content: f.content })),
      )
      setPreviewUrl(url)
      setRunState("ready")
    } catch (err: any) {
      setRunError(err?.message || t("workspace.runFailed"))
      setRunState("error")
    }
  }

  async function handleRefine() {
    const text = prompt.trim()
    if (!text || refining || isGenerating) return
    setRefining(true)
    setRefineNotice(null)
    try {
      const res = await refineProject(projectId, text)
      if (res.success) {
        setPrompt("")
        setRefineNotice({ ok: true, message: t("workspace.refineStarted") })
        fetchProjectRefinements(projectId)
      } else {
        setRefineNotice({ ok: false, message: res.error || t("workspace.refineFailed") })
      }
    } finally {
      setRefining(false)
    }
  }

  async function handleDeploy() {
    setDeploying(true)
    setDeployError(null)
    try {
      const res = await deployProjectToNetlify(projectId)
      if (res.success) await pollDeployStatus(projectId)
      else setDeployError(res.error || t("workspace.deployFailed"))
    } finally {
      setDeploying(false)
    }
  }

  /* ---------------- конвейер ---------------- */

  const steps = useMemo(() => {
    const status = currentProject?.status
    const fileCount = currentProjectFiles.length

    const claudeState: StepState =
      status === "generating" ? "active" : status === "failed" ? "error" : fileCount > 0 ? "done" : "idle"

    const compilerState: StepState = verifying
      ? "active"
      : verifyResult
        ? verifyResult.skipped
          ? "idle"
          : verifyResult.ok
            ? "done"
            : "error"
        : saveErrors.length > 0 || (currentProject?.generationError ? true : false)
          ? "error"
          : fileCount > 0
            ? "done"
            : "idle"

    const runStepState: StepState =
      runState === "starting" ? "active" : runState === "ready" ? "done" : runState === "error" ? "error" : "idle"

    const deployStatus = currentProject?.deployStatus
    const deployState: StepState =
      deploying || deployStatus === "deploying"
        ? "active"
        : deployStatus === "deployed"
          ? "done"
          : deployStatus === "failed"
            ? "error"
            : "idle"

    return [
      {
        key: "intent",
        Icon: Lightbulb,
        label: t("workspace.stepIntent"),
        hint: currentProject?.name ?? "",
        state: (currentProject ? "done" : "idle") as StepState,
      },
      {
        key: "claude",
        Icon: Bot,
        label: t("workspace.stepClaude"),
        hint:
          status === "generating"
            ? genStream.latest?.label ?? t("workspace.stepClaudeWorking")
            : fileCount > 0
              ? t("workspace.stepClaudeDone", { count: fileCount })
              : t("workspace.stepClaudeIdle"),
        state: claudeState,
      },
      {
        key: "compiler",
        Icon: Hammer,
        label: t("workspace.stepCompiler"),
        hint: verifying
          ? t("workspace.stepCompilerRunning")
          : verifyResult && !verifyResult.skipped
            ? verifyResult.ok
              ? t("workspace.stepCompilerOk")
              : t("workspace.stepCompilerErrors")
            : saveErrors.length > 0
              ? t("workspace.stepCompilerWarn", { count: saveErrors.length })
              : t("workspace.stepCompilerIdle"),
        state: compilerState,
      },
      {
        key: "run",
        Icon: Play,
        label: t("workspace.stepRun"),
        hint:
          runState === "starting"
            ? t("workspace.stepRunStarting")
            : runState === "ready"
              ? t("workspace.stepRunReady")
              : t("workspace.stepRunIdle"),
        state: runStepState,
      },
      {
        key: "deploy",
        Icon: Rocket,
        label: t("workspace.stepDeploy"),
        hint:
          deployStatus === "deployed"
            ? t("workspace.stepDeployDone")
            : deployStatus === "deploying" || deploying
              ? t("workspace.stepDeployRunning")
              : t("workspace.stepDeployIdle"),
        state: deployState,
      },
    ]
  }, [currentProject, currentProjectFiles.length, genStream.latest, verifying, verifyResult, saveErrors, runState, deploying, t])

  /* ---------------- рендер ---------------- */

  if (loading && !currentProject) {
    return (
      <div className="eg-page min-h-screen font-sans" style={{ color: COLORS.text }}>
        <Navbar />
        <main className="mx-auto flex max-w-[1240px] flex-col items-center gap-3 px-6 py-24 text-center">
          <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
          <p className="text-[14px]" style={{ color: COLORS.label }}>{t("workspace.loading")}</p>
        </main>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="eg-page min-h-screen font-sans" style={{ color: COLORS.text }}>
        <Navbar />
        <main className="mx-auto flex max-w-[1240px] flex-col items-center gap-4 px-6 py-24 text-center">
          <p className="text-[15px]" style={{ color: COLORS.label }}>{error || t("workspace.notFound")}</p>
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            {t("workspace.backToProjects")}
          </button>
        </main>
      </div>
    )
  }

  const canRun = currentProjectFiles.length > 0 && isolated !== false

  return (
    <div className="eg-page flex min-h-screen flex-col font-sans" style={{ color: COLORS.text }}>
      <Navbar />

      {/* ---- Шапка мастерской ---- */}
      <header className="mx-auto w-full max-w-[1680px] px-4 pt-5 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="inline-flex items-center gap-2 text-[13px] transition-colors"
            style={{ color: COLORS.label }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            {t("workspace.backToProjects")}
          </button>

          <h1 className="text-[19px] font-semibold leading-tight">{currentProject.name}</h1>

          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
            style={{
              border: `1px solid ${isGenerating ? COLORS.accent : currentProject.status === "failed" ? COLORS.red : COLORS.green}`,
              color: isGenerating ? COLORS.accent : currentProject.status === "failed" ? COLORS.red : COLORS.green,
            }}
          >
            {isGenerating ? <Loader2 size={11} className="animate-spin" /> : currentProject.status === "failed" ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
            {isGenerating ? t("workspace.statusGenerating") : currentProject.status === "failed" ? t("workspace.statusFailed") : t("workspace.statusReady")}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Явный мост к экономической витрине — «паспорт проекта» никуда не делся */}
            <button
              type="button"
              onClick={() => router.push(`/projects/${projectId}`)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
            >
              <Boxes size={14} strokeWidth={1.75} />
              {t("workspace.openPassport")}
            </button>
            <button
              type="button"
              onClick={() => window.open(`${API_BASE_URL}/projects/${projectId}/export.zip`, "_blank")}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
            >
              <Download size={14} strokeWidth={1.75} />
              {t("workspace.exportZip")}
            </button>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying || currentProject.deployStatus === "deploying" || currentProject.status !== "ready"}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              {deploying || currentProject.deployStatus === "deploying" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} strokeWidth={1.75} />}
              {t("workspace.deploy")}
            </button>
          </div>
        </div>

        {/* ---- Конвейер: кто и что делает прямо сейчас ---- */}
        <ol className="mt-4 flex flex-wrap items-stretch gap-2">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <div
                className="eg-inset flex min-w-[168px] items-center gap-2.5 rounded-xl px-3 py-2"
                style={{ border: `1px solid ${s.state === "idle" ? COLORS.border : STEP_COLOR[s.state]}` }}
              >
                {s.state === "active" ? (
                  <Loader2 size={15} className="animate-spin" style={{ color: STEP_COLOR.active, flexShrink: 0 }} />
                ) : (
                  <s.Icon size={15} strokeWidth={1.6} style={{ color: STEP_COLOR[s.state], flexShrink: 0 }} />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium" style={{ color: s.state === "idle" ? COLORS.label : COLORS.text }}>
                    {s.label}
                  </p>
                  <p className="truncate text-[10.5px]" style={{ color: COLORS.label }}>{s.hint}</p>
                </div>
              </div>
              {i < steps.length - 1 && <span aria-hidden="true" style={{ color: COLORS.border }}>→</span>}
            </li>
          ))}
        </ol>

        {/* Ошибка генерации — единственное, что важнее конвейера */}
        {currentProject.status === "failed" && currentProject.generationError && (
          <div className="mt-3 flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}` }}>
            <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
            <p className="whitespace-pre-wrap text-[12.5px]">{currentProject.generationError}</p>
          </div>
        )}
        {currentProject.deployStatus === "deployed" && currentProject.liveUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl px-4 py-2.5" style={{ backgroundColor: "rgba(74,222,128,0.06)", border: `1px solid ${COLORS.green}` }}>
            <CheckCircle2 size={15} style={{ color: COLORS.green }} />
            <span className="text-[12.5px]">{t("workspace.deployedAt")}</span>
            <a href={currentProject.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] underline" style={{ color: COLORS.accent }}>
              {currentProject.liveUrl}
              <ExternalLink size={11} strokeWidth={1.75} />
            </a>
          </div>
        )}
        {deployError && (
          <p className="mt-3 text-[12.5px]" style={{ color: COLORS.red }}>{deployError}</p>
        )}

        {/* Переключатель для узких экранов: код ↔ превью */}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
          {(["code", "preview"] as Pane[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPane(p)}
              className="rounded-lg py-2 text-[12.5px] font-medium transition-colors"
              style={{
                border: `1px solid ${pane === p ? COLORS.accent : COLORS.border}`,
                color: pane === p ? COLORS.accent : COLORS.label,
              }}
            >
              {p === "code" ? t("workspace.paneCode") : t("workspace.panePreview")}
            </button>
          ))}
        </div>
      </header>

      {/* ---- Рабочая область ---- */}
      <main className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 gap-4 px-4 py-5 md:px-8 lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* Файлы */}
        <aside className={`eg-surface overflow-hidden rounded-2xl ${pane === "code" ? "" : "hidden lg:block"}`}>
          <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label, borderBottom: `1px solid ${COLORS.border}` }}>
            {t("workspace.filesTitle", { count: currentProjectFiles.length })}
          </div>
          <div className="max-h-[240px] overflow-y-auto lg:max-h-[calc(100vh-330px)]">
            {currentProjectFiles.length === 0 ? (
              <p className="px-4 py-6 text-[12.5px]" style={{ color: COLORS.label }}>
                {isGenerating ? t("workspace.filesGenerating") : t("workspace.filesEmpty")}
              </p>
            ) : (
              currentProjectFiles.map((f) => {
                const active = f.path === selectedPath
                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => {
                      if (f.path === selectedPath) return
                      if (dirty && !confirm(t("workspace.confirmDiscard"))) return
                      setSelectedPath(f.path)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
                    style={{
                      color: active ? COLORS.accent : COLORS.text,
                      backgroundColor: active ? "rgba(0,212,255,0.08)" : "transparent",
                    }}
                  >
                    <FileCode2 size={13} strokeWidth={1.5} style={{ flexShrink: 0, color: active ? COLORS.accent : COLORS.label }} />
                    <span className="truncate">{f.path}</span>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Редактор */}
        <section className={`eg-surface flex flex-col overflow-hidden rounded-2xl ${pane === "code" ? "" : "hidden lg:flex"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <span className="truncate text-[12px]" style={{ color: COLORS.label }}>
              {selectedFile?.path ?? "—"}
              {dirty && <span style={{ color: COLORS.amber }}> •</span>}
            </span>
            <div className="flex items-center gap-2">
              {!saving && savedAt && !dirty && (
                <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: COLORS.green }}>
                  <CheckCircle2 size={12} strokeWidth={1.75} />
                  {hotReloaded ? t("workspace.savedHot") : t("workspace.saved")}
                </span>
              )}
              <button
                type="button"
                onClick={handleVerifyBuild}
                disabled={verifying || currentProjectFiles.length === 0}
                title={t("workspace.verifyHint")}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                {verifying ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} strokeWidth={1.75} />}
                {t("workspace.verify")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={1.75} />}
                {t("workspace.save")}
              </button>
            </div>
          </div>

          <div
            className="h-[420px] lg:h-[calc(100vh-330px)]"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault()
                handleSave()
              }
            }}
          >
            {selectedFile ? (
              <Editor
                key={selectedFile.path}
                height="100%"
                theme="vs-dark"
                language={languageForPath(selectedFile.path)}
                value={draft}
                onChange={(v) => setDraft(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 } }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                {isGenerating ? (
                  <>
                    <Loader2 size={26} className="animate-spin" style={{ color: COLORS.accent }} />
                    <p className="text-[13px]" style={{ color: COLORS.label }}>
                      {genStream.latest?.label ?? t("workspace.filesGenerating")}
                    </p>
                    <div className="h-1.5 w-[220px] overflow-hidden rounded-full" style={{ backgroundColor: "rgba(0,212,255,0.12)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.round((genStream.progress || 0.05) * 100)}%`, backgroundColor: COLORS.accent }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[13px]" style={{ color: COLORS.label }}>{t("workspace.filesEmpty")}</p>
                )}
              </div>
            )}
          </div>

          {saveFailure && (
            <div className="flex items-start gap-2 px-4 py-2.5 text-[12px]" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.red }}>
              <AlertTriangle size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{saveFailure}</span>
            </div>
          )}
          {saveErrors.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2.5 text-[12px]" style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.amber }}>
              <AlertTriangle size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
              <pre className="max-h-[120px] overflow-auto whitespace-pre-wrap font-sans">{saveErrors.join("\n")}</pre>
            </div>
          )}
          {verifyResult && (
            <div
              className="flex items-start gap-2 px-4 py-2.5 text-[12px]"
              style={{
                borderTop: `1px solid ${COLORS.border}`,
                color: verifyResult.skipped ? COLORS.label : verifyResult.ok ? COLORS.green : COLORS.red,
              }}
            >
              {verifyResult.ok && !verifyResult.skipped ? (
                <CheckCircle2 size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
              ) : (
                <AlertTriangle size={13} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <div className="min-w-0">
                <p className="font-medium">
                  {verifyResult.skipped ? t("workspace.verifySkipped") : verifyResult.ok ? t("workspace.verifyOk") : t("workspace.verifyErrors")}
                </p>
                {!verifyResult.ok && verifyResult.logs && (
                  <pre className="mt-1 max-h-[150px] overflow-auto whitespace-pre-wrap font-mono text-[11px]" style={{ color: COLORS.label }}>
                    {verifyResult.logs}
                  </pre>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Живой запуск + чат с Клодом */}
        <section className={`flex flex-col gap-4 ${pane === "preview" ? "" : "hidden lg:flex"}`}>
          <div className="eg-surface flex flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <span className="inline-flex items-center gap-2 text-[12px] font-medium" style={{ color: COLORS.label }}>
                <PanelsTopLeft size={13} strokeWidth={1.75} />
                {t("workspace.previewTitle")}
              </span>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  >
                    <ExternalLink size={12} strokeWidth={1.75} />
                    {t("workspace.openTab")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={!canRun || runState === "starting"}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
                >
                  {runState === "starting" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : runState === "ready" ? (
                    <RefreshCw size={13} strokeWidth={1.75} />
                  ) : (
                    <Play size={13} strokeWidth={1.75} />
                  )}
                  {runState === "ready" ? t("workspace.restart") : t("workspace.run")}
                </button>
              </div>
            </div>

            <div className="h-[300px] lg:h-[calc(100vh-560px)] lg:min-h-[260px]">
              {isolated === false ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <AlertTriangle size={22} style={{ color: COLORS.amber }} />
                  <p className="text-[12.5px]" style={{ color: COLORS.label }}>{t("workspace.noIsolation")}</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={t("workspace.previewTitle")}
                  className="h-full w-full bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  {runState === "starting" ? (
                    <>
                      <Loader2 size={22} className="animate-spin" style={{ color: COLORS.accent }} />
                      <p className="text-[12.5px]" style={{ color: COLORS.label }}>{t("workspace.runStarting")}</p>
                    </>
                  ) : runState === "error" ? (
                    <>
                      <AlertTriangle size={22} style={{ color: COLORS.red }} />
                      <p className="whitespace-pre-wrap text-[12.5px]" style={{ color: COLORS.red }}>{runError}</p>
                    </>
                  ) : (
                    <>
                      <Play size={22} strokeWidth={1.25} style={{ color: COLORS.label }} />
                      <p className="max-w-[280px] text-[12.5px]" style={{ color: COLORS.label }}>{t("workspace.runHint")}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Чат с Клодом — доработка приложения словами */}
          <div className="eg-surface flex flex-col rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[12px] font-medium" style={{ color: COLORS.label }}>
                <Wand2 size={13} strokeWidth={1.75} style={{ color: "var(--elite-gold, #f5c451)" }} />
                {t("workspace.aiTitle")}
              </span>
              {refinementsRemaining !== null && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]"
                  style={{
                    border: `1px solid ${refinementsRemaining > 0 ? "var(--elite-gold, #f5c451)" : COLORS.border}`,
                    color: refinementsRemaining > 0 ? "var(--elite-gold, #f5c451)" : COLORS.label,
                  }}
                >
                  {refinementsRemaining > 0 ? <Sparkles size={11} strokeWidth={1.75} /> : <Coins size={11} strokeWidth={1.75} />}
                  {refinementsRemaining > 0
                    ? t("workspace.aiFree", { count: refinementsRemaining })
                    : t("workspace.aiCost", { cost: REFINEMENT_CREDIT_COST })}
                </span>
              )}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, REFINE_PROMPT_MAX))}
              disabled={isGenerating || refining}
              rows={3}
              placeholder={t("workspace.aiPlaceholder")}
              className="premium-field mt-3 w-full resize-y rounded-xl px-3 py-2.5 text-[13px] outline-none disabled:opacity-60"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleRefine()
              }}
            />

            <button
              type="button"
              onClick={handleRefine}
              disabled={!prompt.trim() || refining || isGenerating}
              className="btn-premium-gold mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refining ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={1.75} />}
              {isGenerating ? t("workspace.aiBusy") : t("workspace.aiSubmit")}
            </button>

            {refineNotice && (
              <p className="mt-2 text-[12px]" style={{ color: refineNotice.ok ? COLORS.green : COLORS.red }}>
                {refineNotice.message}
              </p>
            )}

            {currentProjectRefinements.length > 0 && (
              <ul className="mt-3 max-h-[132px] space-y-1.5 overflow-y-auto">
                {currentProjectRefinements.slice(0, 6).map((r) => (
                  <li key={r.id} className="eg-inset rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-[10.5px]">
                      <span
                        style={{
                          color:
                            r.status === "ready" ? COLORS.green : r.status === "failed" ? COLORS.red : COLORS.accent,
                        }}
                      >
                        {r.status === "generating" ? t("workspace.refStatusRunning") : r.status === "ready" ? t("workspace.refStatusReady") : t("workspace.refStatusFailed")}
                      </span>
                      <span style={{ color: r.costCredits > 0 ? COLORS.label : "var(--elite-gold, #f5c451)" }}>
                        {r.costCredits > 0 ? `${r.costCredits} cr` : t("workspace.refFree")}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px]" style={{ color: "#c8d2ea" }}>{r.prompt}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
