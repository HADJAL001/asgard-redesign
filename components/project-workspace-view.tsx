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
     Замысел → OSGARD 4.0 пишет код → Компилятор проверяет → Запуск в браузере → Деплой
   Состояния конвейера берутся из РЕАЛЬНЫХ сигналов (SSE-стадии генерации,
   ошибки tsc при сохранении, реальная сборка в песочнице, состояние
   WebContainer, deployStatus), а не рисуются для красоты.

   Кросс-origin изоляция (COOP/COEP) для WebContainer выдана этому роуту
   в next.config.mjs. COEP=credentialless — поэтому Monaco с CDN грузится
   на том же экране (это уже доказано роутом /studio, где Monaco и
   WebContainer соседствуют).
   ================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import Editor from "@monaco-editor/react"
import {
  ArrowLeft, FileCode2, Save, Loader2, AlertTriangle, CheckCircle2, Hammer, Play,
  RefreshCw, ExternalLink, Rocket, Send, Sparkles, Wand2, Boxes, Lightbulb, Bot,
  XCircle, Download, PanelsTopLeft, Coins, ShieldCheck, Wrench, ShieldAlert,
  Gauge, SlidersHorizontal, type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { DevTopBar } from "./dev-mode/DevTopBar"
import { DevRail } from "./dev-mode/DevRail"
import { DevStatusBar } from "./dev-mode/DevStatusBar"
import { LiveGenerationMeter, GenerationMeterCard } from "./dev-mode/GenerationMeter"
import { GenerationStory } from "./dev-mode/GenerationStory"
import { WorkshopBackdrop } from "./workshop-backdrop"
import { ConfirmModal } from "./ui/confirm-modal"
import { useDevMode } from "@/lib/dev-mode"
import { useOsgardStore, type RefinementKind } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { API_BASE_URL, apiClient } from "@/lib/api-client"
import { useProjectGenerationStream } from "@/hooks/useProjectGenerationStream"
import { runInWebContainer, syncFileToPreview } from "@/lib/integrations/webcontainer"

/** Цена доработки в кредитах после гранта. Паритет с backend/src/lib/refinements.ts. */
const REFINEMENT_CREDIT_COST = 20
const REFINE_PROMPT_MAX = 2000
/** Выбор «показать код» переживает перезагрузку: разработчик не должен жать кнопку каждый заход. */
const CODE_OPEN_STORAGE_KEY = "osgard.workspace.codeOpen"

type RunState = "idle" | "starting" | "ready" | "error"
type StepState = "idle" | "active" | "done" | "error"
type Pane = "code" | "preview"

const REFINEMENT_MODES: Array<{
  kind: RefinementKind
  icon: LucideIcon
  labelKey: string
}> = [
  { kind: "feature", icon: Boxes, labelKey: "refine.modeFeature" },
  { kind: "design", icon: PanelsTopLeft, labelKey: "refine.modeDesign" },
  { kind: "fix", icon: Wrench, labelKey: "refine.modeFix" },
  { kind: "performance", icon: Gauge, labelKey: "refine.modePerformance" },
  { kind: "custom", icon: SlidersHorizontal, labelKey: "refine.modeCustom" },
]

/* Инженерный вердикт приходит из стора (см. lib/store/osgard-store.tsx).
   Шаг «Компилятор проверяет» раньше дёргал POST /verify-build — реальную сборку в
   Docker-песочнице. В облачном рантайме Docker-демона нет, поэтому в проде эта ручка
   ВСЕГДА отвечает skipped: шаг оставался серым, и человек не узнавал о своём приложении
   ничего. Контур считает то же самое статически (граф модулей, граница клиент/сервер,
   контракт статического экспорта) — без Docker, а значит в бою. */

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

function WorkspaceTopBar({ isDev }: { isDev: boolean }) {
  return isDev ? (
    <>
      <DevRail />
      <DevTopBar />
    </>
  ) : (
    <Navbar />
  )
}

export function ProjectWorkspaceView({ projectId }: { projectId: number }) {
  const { t } = useTranslation()
  const router = useRouter()
  /* Мастерская одна на оба мира OSGARD, но её обрамление зависит от режима:
     в студии разработчика вместо 24-пунктового Navbar — тихая шапка студии,
     а экономические элементы (цена доработки, «паспорт проекта») не
     показываются вовсе. Логика генерации, сборки и деплоя общая — иначе два
     мира разъехались бы на первой же правке. См. lib/dev-mode.tsx. */
  const { mode } = useDevMode()
  const isDev = mode === "dev"
  /** Куда возвращает «назад»: в студии — к её списку кода, в мире — к проектам. */
  const backHref = isDev ? "/dev/workspace" : "/projects"
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
    deployProject,
    fetchProjectEngineering,
    repairProject,
    pollProjectStatus,
    currentProjectEngineering,
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

  /* ---- инженерный вердикт: чем доказана работоспособность приложения ---- */
  const [repairing, setRepairing] = useState(false)
  const [repairNotice, setRepairNotice] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  /* ---- живой запуск ---- */
  const [runState, setRunState] = useState<RunState>("idle")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  /* Кросс-origin изоляция (нужна WebContainer). Это чтение браузерного значения после
     гидратации, а не состояние: раньше оно писалось setState'ом из эффекта монтирования
     (лишний рендер + предупреждение react-hooks). useSyncExternalStore создан ровно для
     этого случая — на сервере снимок null, после гидратации реальное значение. */
  const isolated = useSyncExternalStore(
    () => () => {}, // значение за время жизни документа не меняется — подписка пустая
    () => window.crossOriginIsolated === true,
    () => null as boolean | null,
  )

  /* ---- чат с Клодом (доработки) ---- */
  const [prompt, setPrompt] = useState("")
  const [refineKind, setRefineKind] = useState<RefinementKind>("custom")
  const [refining, setRefining] = useState(false)
  const [refineNotice, setRefineNotice] = useState<{ ok: boolean; message: string } | null>(null)

  /* ---- деплой ---- */
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  /* Публикация приложения с вердиктом «не собирается» — осознанное действие,
     а не случайный клик: сервер отвечает 409 (backend/src/lib/engineering-gate),
     а здесь спрашиваем человека прямо, прежде чем послать acknowledgeBroken. */
  const [confirmBrokenDeploy, setConfirmBrokenDeploy] = useState(false)

  /* ---- мобильная раскладка: код или превью ---- */
  const [pane, setPane] = useState<Pane>("code")

  /* ---- код спрятан по умолчанию ----
     Претензия основателя к этому экрану: «пусть будет видно только как
     генерируется проект, потому что обычный человек это не поймёт эту
     панель — пусть будет скрыто всё, пока пользователь сам не нажмёт
     показать код». Список файлов, Monaco с исходником и инженерные
     проверки — инструменты разработчика; человек пришёл посмотреть на
     СВОЁ ПРИЛОЖЕНИЕ.

     Значение читается из localStorage ПОСЛЕ гидратации, а не в
     инициализаторе useState: сервер про localStorage не знает, и
     несовпадение первого клиентского рендера с серверным дало бы ошибку
     гидратации. Поэтому первый кадр всегда «код скрыт» — то есть
     новый человек видит рассказ о сборке, а тот, кто однажды открыл код,
     получает его открытым сразу после гидратации и не жмёт кнопку каждый
     раз. */
  const [codeOpen, setCodeOpen] = useState(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      try {
        if (window.localStorage.getItem(CODE_OPEN_STORAGE_KEY) === "1") setCodeOpen(true)
      } catch {
        // Приватный режим и заблокированное хранилище — не повод падать.
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    fetchProject(projectId, { skipAuthRedirect: true })
    fetchProjectFiles(projectId, { skipAuthRedirect: true })
    fetchProjectRefinements(projectId)
    fetchProjectEngineering(projectId)
    return () => clearCurrentProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const isGenerating = currentProject?.status === "generating"

  /* Живой лог рождения/доработки приложения. На терминальной стадии тянем
     свежий проект, файлы, ленту правок и свежий вердикт — экран оживает без релоада. */
  const onGenerationDone = useCallback(() => {
    fetchProject(projectId, { skipAuthRedirect: true })
    fetchProjectFiles(projectId, { skipAuthRedirect: true })
    fetchProjectRefinements(projectId)
    fetchProjectEngineering(projectId)
    setRepairing(false)
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
  const toggleCode = useCallback(() => {
    setCodeOpen((open) => {
      // Прятать редактор с несохранёнными правками — молча их терять.
      if (open && dirty && !confirm(t("workspace.confirmDiscard"))) return open
      const next = !open
      try {
        window.localStorage.setItem(CODE_OPEN_STORAGE_KEY, next ? "1" : "0")
      } catch {
        // Не смогли запомнить выбор — показываем то, что попросили сейчас.
      }
      return next
    })
  }, [dirty, t])

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

  /* Проверить и починить: гоняем инженерный контур по УЖЕ СОХРАНЁННЫМ файлам.
     Ручка отвечает 202 и работает фоном, поэтому подтягиваем проект — он уходит в
     'generating', включается тот же SSE-поток, и человек видит живые стадии
     building/repairing вместо немого спиннера. Терминал стадии вернёт вердикт. */
  const handleRepair = useCallback(async () => {
    if (repairing || isGenerating) return
    setRepairing(true)
    setRepairNotice(null)
    const res = await repairProject(projectId)
    if (res.success) {
      setShowReport(true)
      /* Ждём завершения контура опросом статуса, а НЕ только терминальной стадией SSE.
         Причина — реальная гонка, пойманная на живом стенде: механический ремонт без AI
         успевает закончиться раньше, чем клиент перечитает проект, — статус уже 'ready',
         поток стадий не включается вовсе, и шаг конвейера навсегда застревал в «идёт
         проверка». Опрос отрабатывает оба случая: и мгновенный, и долгий (AI-раунды). */
      await pollProjectStatus(projectId)
      await fetchProjectEngineering(projectId)
      setRepairing(false)
    } else {
      // 429 — дорогая ручка под лимитом, 409 — идёт генерация. Говорим человеку правду.
      setRepairNotice(res.error || t("workspace.repairFailed"))
      setRepairing(false)
    }
  }, [fetchProjectEngineering, isGenerating, pollProjectStatus, projectId, repairProject, repairing, t])

  const handleRun = useCallback(async () => {
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
  }, [currentProjectFiles, runState, t])

  async function handleRefine() {
    const text = prompt.trim()
    if (!text || refining || isGenerating) return
    setRefining(true)
    setRefineNotice(null)
    try {
      const res = await refineProject(projectId, text, refineKind)
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

  const handleDeploy = useCallback(async (opts?: { acknowledgeBroken?: boolean }) => {
    setDeploying(true)
    setDeployError(null)
    try {
      const res = await deployProject(projectId, opts)
      if (res.success) {
        await pollDeployStatus(projectId)
        /* Сборка идёт уже в кластере, и её приговор возвращается в вердикт
           проекта (backend/src/lib/engineering-gate) — перечитываем, иначе экран
           продолжит показывать «проверено» после провалившейся сборки. */
        await fetchProjectEngineering(projectId)
      } else {
        setDeployError(res.error || t("workspace.deployFailed"))
      }
    } finally {
      setDeploying(false)
      setConfirmBrokenDeploy(false)
    }
  }, [deployProject, fetchProjectEngineering, pollDeployStatus, projectId, t])

  /* ---------------- инженерный вердикт: производные ----------------
     Всё считаем ИЗ отчёта, а не из отдельных полей: балл и объяснение не имеют права
     разойтись (тот же приём, что на бэкенде — вердикт производен от списка дефектов). */
  const engineering = currentProjectEngineering
  const report = engineering?.report ?? null
  const errorDefects = useMemo(
    () => (report?.defects ?? []).filter((d) => d.severity === "error"),
    [report],
  )
  const repairCount = report?.repairs?.length ?? 0
  const passedChecks = (report?.checks ?? []).filter((c) => c.passed).length
  const totalChecks = report?.checks?.length ?? 0
  /* Допуск к публикации. Выстрел 30.07.2026: платформа сама написала «40 нерешённых
     дефектов» и тем же экраном предложила «Опубликовать» — приложение уехало в
     кластер и там не собралось. Пока вердикт broken, публикация перестаёт быть
     рядовым действием: кнопка не притворяется готовой, рядом видна причина, а
     обойти гейт можно только осознанно (то же требование стоит и на сервере). */
  const deployBlocked = engineering?.verdict === "broken"
  /* Вердикт, вынесенный НАСТОЯЩЕЙ сборкой при публикации, — сильнейшее из
     доказательств: показываем его отдельно от статического разбора. */
  const realBuildFailure = report?.realBuild && report.realBuild.ok === false ? report.realBuild : null
  /* Живая стадия контура из общего SSE-потока: тот же поток, что и у генерации —
     ремонт эмитит building/repairing, поэтому отдельный канал не нужен. */
  const contourStage =
    genStream.latest && (genStream.latest.stage === "building" || genStream.latest.stage === "repairing")
      ? genStream.latest
      : null

  /* ---------------- конвейер ---------------- */

  const steps = useMemo(() => {
    const status = currentProject?.status
    const fileCount = currentProjectFiles.length

    const claudeState: StepState =
      status === "generating" ? "active" : status === "failed" ? "error" : fileCount > 0 ? "done" : "idle"

    /* Шаг компилятора теперь отражает ИНЖЕНЕРНЫЙ ВЕРДИКТ, а не «файлы записались».
       Раньше он зеленел от одного факта наличия файлов — то есть врал: проект с битыми
       импортами показывал «проверено». Теперь: нет вердикта → серый «не проверено»
       (не зелёный!), broken → красный, passed/repaired → зелёный. */
    const verdict = engineering?.verdict ?? null
    const contourRunning = repairing || contourStage !== null
    const compilerState: StepState = contourRunning
      ? "active"
      : saveErrors.length > 0
        ? "error"
        : verdict === "broken"
          ? "error"
          : verdict === "passed" || verdict === "repaired"
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
        Icon: verdict === "broken" ? ShieldAlert : ShieldCheck,
        label: t("workspace.stepCompiler"),
        hint: contourRunning
          ? contourStage?.label ?? t("workspace.stepCompilerRunning")
          : saveErrors.length > 0
            ? t("workspace.stepCompilerWarn", { count: saveErrors.length })
            : verdict === "passed"
              ? t("workspace.stepCompilerPassed", { count: passedChecks })
              : verdict === "repaired"
                ? t("workspace.stepCompilerRepaired", { count: repairCount })
                : verdict === "broken"
                  ? t("workspace.stepCompilerBroken", { count: errorDefects.length })
                  : t("workspace.stepCompilerUnverified"),
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
  }, [
    currentProject,
    currentProjectFiles.length,
    genStream.latest,
    engineering,
    repairing,
    contourStage,
    errorDefects.length,
    repairCount,
    passedChecks,
    saveErrors,
    runState,
    deploying,
    t,
  ])

  /* ---------------- следующее действие ----------------
     Жалоба пользователя: пять карточек конвейера нужно прочитать все, чтобы
     понять одно важное действие прямо сейчас. Баннер сводит это к одному
     приоритету: ошибка → идёт процесс → первый непройденный шаг → готово. */
  const nextAction = useMemo(() => {
    const compilerStep = steps.find((s) => s.key === "compiler")!
    const runStep = steps.find((s) => s.key === "run")!
    const deployStep = steps.find((s) => s.key === "deploy")!

    const pipeline = [
      {
        step: compilerStep,
        tour: "workspace-verify-btn",
        pane: "code" as Pane,
        onAction: handleRepair,
        actionLabel: engineering?.verdict === "broken" ? t("workspace.repair") : t("workspace.verify"),
      },
      {
        step: runStep,
        tour: "workspace-run-btn",
        pane: "preview" as Pane,
        onAction: handleRun,
        actionLabel: runState === "ready" ? t("workspace.restart") : t("workspace.run"),
      },
      {
        step: deployStep,
        tour: "workspace-deploy-btn",
        pane: "preview" as Pane,
        onAction: handleDeploy,
        actionLabel: t("workspace.deploy"),
      },
    ]

    const errored = pipeline.find((p) => p.step.state === "error")
    if (errored) return { tone: "error" as const, text: errored.step.hint, action: errored }

    const active = pipeline.find((p) => p.step.state === "active")
    if (active) return { tone: "progress" as const, text: active.step.hint, action: null }

    const pending = pipeline.find((p) => p.step.state === "idle")
    if (pending) return { tone: "action" as const, text: pending.step.hint, action: pending }

    return { tone: "done" as const, text: t("workspace.nextAllDone"), action: null }
  }, [steps, engineering?.verdict, runState, handleRepair, handleRun, handleDeploy, t])

  /* Одна фраза для студии вместо трёх сигналов.
     На скриншоте основателя экран одновременно утверждал «Готово»
     (бейдж проекта), «Нужно починить» (eyebrow баннера) и «Дефекты
     исправлены» (полоса вердикта) — про одно и то же состояние.
     Причина: бейдж говорит про генерацию, баннер — про следующий шаг,
     вердикт — про прошлую проверку. Здесь сводим к одному смыслу:
     что сейчас и что дальше, в одном предложении. */
  const devHeadline = useMemo(() => {
    if (currentProject?.status === "generating") return "Клод собирает приложение…"
    if (currentProject?.status === "failed") return "Сборка не удалась — опишите задачу иначе"
    if (deploying || currentProject?.deployStatus === "deploying") return "Публикуем в интернете…"

    if (nextAction.tone === "progress") return nextAction.text
    if (nextAction.tone === "error") return nextAction.text

    /* Свершившийся факт важнее предложения следующего шага: шаг «Деплой»
       остаётся idle и после успешной публикации, поэтому проверку статуса
       деплоя держим ВЫШЕ веток stepKey — иначе опубликованный проект
       предлагал бы «показать миру» то, что уже показано. */
    if (currentProject?.deployStatus === "deployed") return "Опубликовано и доступно по адресу"

    /* Подсказки шагов написаны языком отчёта («проверка не проводилась»).
       В студии говорим то же самое как человек — от лица того, что можно
       сделать сейчас, а не от лица журнала событий. */
    const stepKey = nextAction.action?.step.key
    if (stepKey === "compiler") return "Код написан — давайте проверим его"
    if (stepKey === "run") return "Проверено. Посмотрим, как это работает"
    if (stepKey === "deploy") return "Работает — можно показать миру"

    const fileCount = currentProjectFiles.length
    if (runState === "ready") return "Приложение запущено — можно публиковать"
    if (fileCount > 0) {
      // Починенные дефекты — часть хорошей новости, а не отдельная тревога.
      const repaired = repairCount > 0 ? `, ${repairCount} ${repairCount === 1 ? "дефект исправлен" : "дефекта исправлено"}` : ""
      return `Готово: ${fileCount} ${fileCount === 1 ? "файл" : fileCount < 5 ? "файла" : "файлов"}${repaired}`
    }
    return nextAction.text
  }, [
    currentProject?.status,
    currentProject?.deployStatus,
    deploying,
    nextAction,
    currentProjectFiles.length,
    runState,
    repairCount,
  ])

  function goToNextAction() {
    if (!nextAction.action) return
    setPane(nextAction.action.pane)
    nextAction.action.onAction()
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tour="${nextAction.action!.tour}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    })
  }

  /* ---------------- рендер ---------------- */

  if (loading && !currentProject) {
    return (
      <div className="eg-page min-h-screen font-sans" style={{ color: COLORS.text }}>
        <WorkspaceTopBar isDev={isDev} />
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
        <WorkspaceTopBar isDev={isDev} />
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
    <div
      className={`eg-page relative flex min-h-screen flex-col font-sans${isDev ? " dev-mode-layout" : ""}`}
      style={{ color: COLORS.text }}
    >
      {/* Мастерская мира рисует свой тёплый фон; в студии его роль играет
          общий AmbientBackdrop, перекрашенный в сине-серебряную гамму. */}
      {isDev ? null : <WorkshopBackdrop />}
      <WorkspaceTopBar isDev={isDev} />

      {/* ---- Шапка мастерской ---- */}
      <header className="relative z-10 mx-auto w-full max-w-[1680px] px-4 pt-5 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-2 text-[13px] transition-colors"
            style={{ color: COLORS.label }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            {isDev ? "К проектам студии" : t("workspace.backToProjects")}
          </button>

          <h1 className="text-[19px] font-semibold leading-tight">{currentProject.name}</h1>

          {/* Бейдж статуса — в студии его роль взяла строка состояния ниже.
              Именно он спорил с баннером: «Готово» рядом с «Нужно починить». */}
          <span
            className={`items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${isDev ? "hidden" : "inline-flex"}`}
            style={{
              border: `1px solid ${isGenerating ? COLORS.accent : currentProject.status === "failed" ? COLORS.red : COLORS.green}`,
              color: isGenerating ? COLORS.accent : currentProject.status === "failed" ? COLORS.red : COLORS.green,
            }}
          >
            {isGenerating ? <Loader2 size={11} className="animate-spin" /> : currentProject.status === "failed" ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
            {isGenerating ? t("workspace.statusGenerating") : currentProject.status === "failed" ? t("workspace.statusFailed") : t("workspace.statusReady")}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Явный мост к экономической витрине — «паспорт проекта» никуда не делся.
                В студии разработчика его нет: витрина — это артефакты и доход,
                то есть ровно то, чего в этом режиме не существует. Кому нужно —
                переключается в мир одной кнопкой в шапке. */}
            {isDev ? null : (
              <button
                type="button"
                onClick={() => router.push(`/projects/${projectId}`)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.label }}
              >
                <Boxes size={14} strokeWidth={1.75} />
                {t("workspace.openPassport")}
              </button>
            )}
            {/* Вход в инструменты разработчика. Кнопка есть всегда — «скрыто»
                не значит «недоступно»; человек, которому код нужен, находит его
                одним нажатием, а не в настройках. */}
            <button
              type="button"
              data-tour="workspace-code-toggle"
              onClick={toggleCode}
              aria-expanded={codeOpen}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors"
              style={{
                border: `1px solid ${codeOpen ? COLORS.accent : COLORS.border}`,
                color: codeOpen ? COLORS.accent : COLORS.label,
              }}
            >
              <FileCode2 size={14} strokeWidth={1.75} />
              {codeOpen ? t("workspace.hideCode") : t("workspace.showCode")}
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
              data-tour="workspace-deploy-btn"
              onClick={() => handleDeploy()}
              disabled={
                deploying ||
                currentProject.deployStatus === "deploying" ||
                currentProject.status !== "ready" ||
                deployBlocked
              }
              aria-describedby={deployBlocked ? "workspace-deploy-blocked" : undefined}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            >
              {deploying || currentProject.deployStatus === "deploying" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} strokeWidth={1.75} />}
              {t("workspace.deploy")}
            </button>
          </div>
        </div>

        {/* ---- Почему публикация недоступна ----
             Причина стоит РЯДОМ с погашенной кнопкой и видна глазами (не только
             в title/скринридере) — тот же приём, что в Кузнице с исчерпанным
             дневным лимитом. Без него погашенная кнопка читается как поломка
             интерфейса, а не как честный отказ платформы. */}
        {deployBlocked && (
          <div
            id="workspace-deploy-blocked"
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2"
            style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}33` }}
          >
            <ShieldAlert size={15} style={{ color: COLORS.red, flexShrink: 0 }} />
            <span className="text-[12.5px]" style={{ color: COLORS.red }}>
              {t("workspace.deployBlocked", { count: errorDefects.length })}
            </span>
            <span className="text-[12px]" style={{ color: COLORS.label }}>
              {realBuildFailure ? t("workspace.verdictRealBuildFailed") : t("workspace.deployBlockedHint")}
            </span>
            {/* Обход остаётся: платформа не хозяин чужому решению. Но это
                вторичная ссылка с подтверждением, а не главная кнопка. */}
            <button
              type="button"
              onClick={() => setConfirmBrokenDeploy(true)}
              disabled={deploying || currentProject.deployStatus === "deploying"}
              className="text-[12px] underline underline-offset-2 disabled:opacity-40"
              style={{ color: COLORS.label }}
            >
              {t("workspace.deployAnyway")}
            </button>
          </div>
        )}

        <ConfirmModal
          open={confirmBrokenDeploy}
          onCancel={() => setConfirmBrokenDeploy(false)}
          onConfirm={() => handleDeploy({ acknowledgeBroken: true })}
          title={t("workspace.deployAnywayTitle")}
          message={t("workspace.deployAnywayMessage", { count: errorDefects.length })}
          confirmLabel={t("workspace.deployAnywayConfirm")}
          cancelLabel={t("workspace.cancel")}
          loading={deploying}
          danger
        />

        {/* ---- Студия: всё состояние одной строкой ----
             В режиме разработчика баннер, лента конвейера и полоса вердикта
             схлопываются в DevStatusBar: пять точек + одна фраза + одно
             действие. Подробности вердикта раскрываются кнопкой «Подробнее»
             (тот же showReport, что и в мире) — они ниже по коду и общие. */}
        {isDev ? (
          <div className="mt-4">
            <DevStatusBar
              steps={steps}
              tone={nextAction.tone}
              headline={devHeadline}
              actionLabel={nextAction.action?.actionLabel}
              onAction={nextAction.action ? goToNextAction : undefined}
              detailsOpen={showReport}
              onToggleDetails={() => setShowReport((v) => !v)}
              hasDetails={
                errorDefects.length > 0 || repairCount > 0 || totalChecks > 0 || !!engineering?.meter
              }
            />
          </div>
        ) : null}

        {/* ---- Живой расход, пока приложение собирается ----
             Показывается в ОБОИХ режимах: непредсказуемость расхода — претензия
             №1 к AI-сборщикам, и она не про режим интерфейса. Итоговый чек
             намеренно уехал в «Подробнее» (ниже): его цветная строка «с первого
             раза / понадобился ремонт» рядом с фразой статуса дала бы на экране
             два спорящих сигнала — ровно та ошибка, из-за которой в студии
             появился DevStatusBar. Пока сборка идёт, спорить не с чем: статус
             говорит «что происходит», счётчик — «во что это обходится». */}
        {isGenerating ? (
          <div className="mt-3">
            <LiveGenerationMeter
              meter={genStream.meter}
              startedAt={genStream.stages[0]?.at ?? null}
              active={!genStream.done}
            />
          </div>
        ) : null}

        {/* ---- Что делать дальше: одно приоритетное действие вместо пяти карточек ---- */}
        <div
          className={`premium-panel mt-4 flex-wrap items-center gap-3 rounded-xl px-4 py-3 ${isDev ? "hidden" : "flex"}`}
        >
          {nextAction.tone === "error" ? (
            <ShieldAlert size={17} style={{ color: COLORS.red, flexShrink: 0 }} />
          ) : nextAction.tone === "progress" ? (
            <Loader2 size={17} className="animate-spin" style={{ color: "var(--eg-gold-2)", flexShrink: 0 }} />
          ) : nextAction.tone === "done" ? (
            <CheckCircle2 size={17} style={{ color: COLORS.green, flexShrink: 0 }} />
          ) : (
            <Wand2 size={17} style={{ color: "var(--eg-gold-2)", flexShrink: 0 }} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: COLORS.label }}>
              {nextAction.tone === "error"
                ? t("workspace.nextEyebrowError")
                : nextAction.tone === "progress"
                  ? t("workspace.nextEyebrowProgress")
                  : nextAction.tone === "done"
                    ? t("workspace.nextEyebrowDone")
                    : t("workspace.nextEyebrowAction")}
            </p>
            <p className="truncate text-[13.5px] font-medium">{nextAction.text}</p>
          </div>
          {nextAction.action && (
            <button type="button" onClick={goToNextAction} className="btn-premium-gold shrink-0 rounded-lg px-4 py-2 text-[12.5px] font-medium">
              {nextAction.action.actionLabel}
            </button>
          )}
        </div>

        {/* ---- Конвейер: кто и что делает прямо сейчас ----
             В студии его роль играют пять точек в DevStatusBar выше. */}
        <ol className={`mt-4 flex-wrap items-stretch gap-2 ${isDev ? "hidden" : "flex"}`}>
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

        {/* ---- Инженерный вердикт: чем именно доказана работоспособность ----
             Раскрывается по клику на строку итога. Показываем ровно то, что вынес контур:
             какие проверки прошли, что платформа починила сама, что осталось битым. */}
        {/* В студии панель появляется, только когда человек сам нажал
            «Подробнее»: постоянная цветная полоса — это третий сигнал о
            статусе на экране, где уже есть точки и фраза. */}
        {(engineering?.verdict || repairNotice) && (!isDev || showReport) && (
          <div
            className="mt-3 rounded-xl px-4 py-3"
            style={
              isDev
                ? { background: "rgb(226 232 240 / 4%)", border: "1px solid rgb(226 232 240 / 12%)" }
                : {
                    backgroundColor:
                      engineering?.verdict === "broken" ? "rgba(248,113,113,0.06)" : "rgba(74,222,128,0.05)",
                    border: `1px solid ${
                      engineering?.verdict === "broken"
                        ? COLORS.red
                        : engineering?.verdict === "passed" || engineering?.verdict === "repaired"
                          ? COLORS.green
                          : COLORS.border
                    }`,
                  }
            }
          >
            {/* Строка итога — в студии её содержание уже сказано одной фразой
                в DevStatusBar, второй раз повторять незачем. Раскрытые
                подробности ниже остаются общими для обоих режимов. */}
            <div className={`flex-wrap items-center gap-2 ${isDev ? "hidden" : "flex"}`}>
              {engineering?.verdict === "broken" ? (
                <ShieldAlert size={15} style={{ color: COLORS.red, flexShrink: 0 }} />
              ) : (
                <ShieldCheck size={15} style={{ color: COLORS.green, flexShrink: 0 }} />
              )}
              <p className="text-[12.5px] font-medium">
                {engineering?.verdict === "passed"
                  ? t("workspace.verdictPassed", { count: passedChecks, total: totalChecks })
                  : engineering?.verdict === "repaired"
                    ? t("workspace.verdictRepaired", { count: repairCount })
                    : engineering?.verdict === "broken"
                      ? t("workspace.verdictBroken", { count: errorDefects.length })
                      : t("workspace.verdictUnverified")}
              </p>
              {report?.verifiedBy && (
                <span className="text-[11px]" style={{ color: COLORS.label }}>
                  {report.verifiedBy === "sandbox"
                    ? t("workspace.provenBySandbox")
                    : report.verifiedBy === "real-build"
                      ? t("workspace.provenByRealBuild")
                      : t("workspace.provenByStatic")}
                </span>
              )}
              {(errorDefects.length > 0 || repairCount > 0 || totalChecks > 0) && (
                <button
                  type="button"
                  onClick={() => setShowReport((v) => !v)}
                  className="ml-auto text-[11.5px] underline"
                  style={{ color: COLORS.accent }}
                >
                  {showReport ? t("workspace.hideReport") : t("workspace.showReport")}
                </button>
              )}
            </div>

            {repairNotice && (
              <p className="mt-2 text-[12px]" style={{ color: COLORS.amber }}>{repairNotice}</p>
            )}

            {/* ---- Чек сборки: во что обошлась и вышло ли с первого раза ----
                 Первым в подробностях, до списка проверок: человека сначала
                 интересует цена и результат целиком, а уже потом — чем именно
                 он доказан. `meter=null` честно пишет «не измерялось» вместо
                 нулей (проекты старше миграции 095). */}
            {showReport && <GenerationMeterCard meter={engineering?.meter} />}

            {showReport && (
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {/* Что проверяли */}
                {totalChecks > 0 && (
                  <div className="eg-inset rounded-lg px-3 py-2.5">
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide" style={{ color: COLORS.label }}>
                      {t("workspace.reportChecks")}
                    </p>
                    <ul className="space-y-1">
                      {(report?.checks ?? []).map((c) => (
                        <li key={c.key} className="flex items-start gap-1.5 text-[11.5px]">
                          {c.passed ? (
                            <CheckCircle2 size={12} style={{ color: COLORS.green, flexShrink: 0, marginTop: 2 }} />
                          ) : (
                            <XCircle size={12} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
                          )}
                          <span style={{ color: c.passed ? COLORS.label : COLORS.text }}>{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Что платформа починила сама */}
                {repairCount > 0 && (
                  <div className="eg-inset rounded-lg px-3 py-2.5">
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide" style={{ color: COLORS.label }}>
                      {t("workspace.reportRepairs")}
                    </p>
                    <ul className="space-y-1">
                      {(report?.repairs ?? []).slice(0, 8).map((r, i) => (
                        <li key={`${r.file}-${i}`} className="text-[11.5px]">
                          <span style={{ color: COLORS.green }}>{r.file}</span>
                          <span style={{ color: COLORS.label }}> — {r.action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Что осталось битым — с переходом на файл в редакторе */}
                {errorDefects.length > 0 && (
                  <div className="eg-inset rounded-lg px-3 py-2.5">
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide" style={{ color: COLORS.label }}>
                      {t("workspace.reportDefects")}
                    </p>
                    <ul className="space-y-1.5">
                      {errorDefects.slice(0, 8).map((d, i) => (
                        <li key={`${d.file}-${d.rule}-${i}`} className="text-[11.5px]">
                          <button
                            type="button"
                            onClick={() => {
                              if (currentProjectFiles.some((f) => f.path === d.file)) {
                                setSelectedPath(d.file)
                                setPane("code")
                              }
                            }}
                            className="underline"
                            style={{ color: COLORS.red }}
                          >
                            {d.file}
                          </button>
                          <span style={{ color: COLORS.label }}> — {d.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ошибка генерации — единственное, что важнее конвейера */}
        {currentProject.status === "failed" && currentProject.generationError && (
          <div className="mt-3 flex flex-wrap items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(248,113,113,0.06)", border: `1px solid ${COLORS.red}` }}>
            <AlertTriangle size={16} style={{ color: COLORS.red, flexShrink: 0, marginTop: 2 }} />
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[12.5px]">{currentProject.generationError}</p>
            <button
              type="button"
              onClick={handleRepair}
              disabled={repairing || isGenerating || currentProjectFiles.length === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ border: `1px solid ${COLORS.red}`, color: COLORS.text }}
              title={t("workspace.repair")}
            >
              {repairing ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} strokeWidth={1.75} />}
              {t("workspace.repair")}
            </button>
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

        {/* Переключатель для узких экранов: код ↔ превью.
            Прячем вместе с кодом — выбирать между «кодом» и «приложением»
            там, где кода нет, значит предлагать несуществующий выбор. */}
        <div className={`mt-4 grid-cols-2 gap-2 lg:hidden ${codeOpen ? "grid" : "hidden"}`}>

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
      {/* Пропорции панелей зависят от режима.
          В мире код шире превью (1fr против 0.9fr) — это экран инженера.
          В студии наоборот: человек пришёл увидеть СВОЁ ПРИЛОЖЕНИЕ, а не
          читать исходники, поэтому превью получает больше половины, а
          список файлов ужимается. Код остаётся рядом, не прячется. */}
      <main
        className={`relative z-10 mx-auto grid w-full flex-1 grid-cols-1 gap-4 px-4 py-5 md:px-8 ${
          codeOpen
            ? isDev
              ? "max-w-[1680px] lg:grid-cols-[180px_minmax(0,0.85fr)_minmax(0,1.35fr)]"
              : "max-w-[1680px] lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,0.9fr)]"
            : // Код скрыт: одна колонка и уже максимум — приложение и рассказ о
              // сборке читаются по центру, а не растянутыми на весь монитор.
              "max-w-[1100px]"
        }`}
      >
        {/* Файлы. Не `hidden`, а вовсе не смонтированы, когда код скрыт:
            иначе список и Monaco грузились бы ради экрана, где их не видно. */}
        {codeOpen && (
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
        )}

        {/* Редактор */}
        {codeOpen && (
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
                data-tour="workspace-verify-btn"
                onClick={handleRepair}
                disabled={repairing || isGenerating || currentProjectFiles.length === 0}
                title={t("workspace.verifyHint")}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
              >
                {repairing || contourStage ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} strokeWidth={1.75} />}
                {engineering?.verdict === "broken" ? t("workspace.repair") : t("workspace.verify")}
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
          {/* Живая стадия контура прямо под редактором: пока платформа чинит код,
              человек видит, ЧТО именно она делает, а не немой спиннер. Итог разбора
              показывается панелью вердикта над конвейером. */}
          {(repairing || contourStage) && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 text-[12px]"
              style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.accent }}
            >
              <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0 }} />
              <span>{contourStage?.label ?? t("workspace.stepCompilerRunning")}</span>
              {typeof contourStage?.defects === "number" && contourStage.defects > 0 && (
                <span style={{ color: COLORS.label }}>
                  {t("workspace.stepCompilerBroken", { count: contourStage.defects })}
                </span>
              )}
            </div>
          )}
        </section>
        )}

        {/* Живой запуск + чат с Клодом.
            Когда код скрыт, эта колонка — весь экран, и прятать её на узких
            экранах по `pane` нельзя: скрывать было бы нечего в пользу чего. */}
        <section className={`flex flex-col gap-4 ${!codeOpen || pane === "preview" ? "" : "hidden lg:flex"}`}>
          {/* Рождение приложения вместо инструментов, пока смотреть ещё не на
              что: генерация идёт или файлов нет. Это и есть «видно только как
              генерируется проект» из претензии основателя. */}
          {!codeOpen && (isGenerating || currentProjectFiles.length === 0) && (
            <GenerationStory
              steps={steps}
              headline={devHeadline}
              progress={isGenerating ? genStream.progress || 0.05 : null}
              projectName={currentProject.name}
              failed={currentProject.status === "failed"}
              /* Пока DeepSeek пишет код, действия не предлагаем вовсе. Найдено
                 глазами на живом экране: рассказ показывал кнопку «Проверить»
                 в момент генерации — то есть предлагал проверить то, чего ещё
                 нет, и вторым экземпляром той же кнопки из полосы статуса.
                 Действие уместно, когда генерация кончилась: например
                 «Попробовать снова» после провала. */
              actionLabel={isGenerating ? undefined : nextAction.action?.actionLabel}
              onAction={isGenerating || !nextAction.action ? undefined : goToNextAction}
            />
          )}
          {/* Пока приложения ещё нет, пустая рамка «Живой запуск» с недоступной
              кнопкой ничего не сообщает — на её месте рассказ выше. */}
          {(codeOpen || !(isGenerating || currentProjectFiles.length === 0)) && (
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
                  data-tour="workspace-run-btn"
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

            {/* Без колонки кода приложению отдаётся почти весь экран: человек
                пришёл смотреть на него, а не на рамку вокруг него. */}
            <div
              className={
                codeOpen
                  ? "h-[300px] lg:h-[calc(100vh-560px)] lg:min-h-[260px]"
                  : "h-[440px] lg:h-[calc(100vh-420px)] lg:min-h-[420px]"
              }
            >
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
          )}

          {/* Чат с Клодом — доработка приложения словами */}
          <div className="eg-surface flex flex-col rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[12px] font-medium" style={{ color: COLORS.label }}>
                <Wand2 size={13} strokeWidth={1.75} style={{ color: "var(--elite-gold, #f5c451)" }} />
                {t("workspace.aiTitle")}
              </span>
              {/* Счётчик бесплатных доработок и цена в кредитах — экономика.
                  В студии её нет: сама доработка работает ровно так же, просто
                  не показывается ценник. */}
              {refinementsRemaining !== null && !isDev && (
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

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label={t("refine.kindLabel")}>
              {REFINEMENT_MODES.map(({ kind, icon: ModeIcon, labelKey }) => {
                const selected = refineKind === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={selected}
                    disabled={isGenerating || refining}
                    onClick={() => setRefineKind(kind)}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      borderColor: selected ? "var(--elite-gold, #f5c451)" : COLORS.border,
                      background: selected ? "rgb(245 196 81 / 10%)" : "rgb(255 255 255 / 2%)",
                      color: selected ? "var(--elite-gold, #f5c451)" : COLORS.label,
                    }}
                  >
                    <ModeIcon size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span className="truncate">{t(labelKey)}</span>
                  </button>
                )
              })}
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
                      {/* Стоимость доработки в кредитах — экономика, в студии не показывается. */}
                      {isDev ? null : (
                        <span style={{ color: r.costCredits > 0 ? COLORS.label : "var(--elite-gold, #f5c451)" }}>
                          {r.costCredits > 0 ? `${r.costCredits} cr` : t("workspace.refFree")}
                        </span>
                      )}
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
