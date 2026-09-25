"use client"

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { FilePlus2, Gem, Lightbulb, Radar, ShieldCheck, Share2, X } from "lucide-react"
import { MemoryLayerRail } from "@/components/design-system/MemoryLayerRail"
import { OrbitalMemory } from "@/components/design-system/OrbitalMemory"
import { PresetSwitcher } from "@/components/design-system/PresetSwitcher"
import { CinematicSequence, type SequenceStage } from "@/components/design-system/CinematicSequence"
import { track } from "@/lib/analytics"
import { useAuth } from "@/lib/auth-store"
import { CofounderLoadingShell } from "@/components/cofounder/CofounderLoadingShell"
import { ProductCatalog, type ProductType, type VisualPreset } from "@/components/cofounder/ProductCatalog"
import { ObsidianCosmos } from "@/components/design-system/ObsidianCosmos"
import { CosmicCursor } from "@/components/design-system/CosmicCursor"
import { BlueprintCanvas, type BlueprintCanvasPlan } from "@/components/cofounder/BlueprintCanvas"

type CompileResult = { id: string; revision: number; score: number; review: boolean; warnings: string[]; app: string; brief: string; productType?: ProductType; preset?: VisualPreset; contractVersion?: string; contractHash?: string; createdAt: string; aiSummary?: string; aiComponents?: string[]; aiRisks?: string[]; approved?: boolean }
type PreviewPlan = { revision: number; slots: { id: string; component: string; role: string; states: string[] }[]; stages: string[] }
type EvidenceRecord = { id: string; revision: number; kind: string; status: "passed" | "failed" | "skipped"; summary: string; source: string; capturedAt: string; contractHash: string }
type QualityState = { required: string[]; missing: string[]; stale: { kind: string; reason: string; revision?: number; expectedRevision: number }[]; approval: boolean; readyForCodegen: boolean }
type GenerationStatus = { status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress: number; currentStep?: string; error?: string; result?: { appUrl?: string; previewUrl?: string; repoUrl?: string } }

const starterMissions = [
  { id: "launch", label: "Launch a product", brief: "Create a focused product workspace where a team can move from idea to a verified first release in one session." },
  { id: "community", label: "Build a community", brief: "Create a trusted community experience with profiles, a live feed, moderation signals, and a clear first contribution path." },
  { id: "ai-operator", label: "Ship an AI operator", brief: "Create an AI operator with durable memory, transparent evidence, and a safe approval step before code is generated." },
] as const

export function CofounderConsole() {
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false)
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [contractName, setContractName] = useState("")
  const [brief, setBrief] = useState("")
  const [productType, setProductType] = useState<ProductType>("application")
  const [visualPreset, setVisualPreset] = useState<VisualPreset>("futuristic")
  const [submitting, setSubmitting] = useState(false)
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null)
  const [previewPlan, setPreviewPlan] = useState<PreviewPlan | null>(null)
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([])
  const [qualityState, setQualityState] = useState<QualityState | null>(null)
  const [history, setHistory] = useState<CompileResult[]>(() => {
    if (typeof window === "undefined") return []
    try { return JSON.parse(localStorage.getItem("osgard-blueprint-history") || "[]") as CompileResult[] } catch { return [] }
  })
  const [compileError, setCompileError] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  const [approving, setApproving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationTask, setGenerationTask] = useState<string | null>(null)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const lastGenerationStatus = useRef<string | null>(null)
  const generationPollFailures = useRef(0)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLInputElement>("input")?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  async function loadPreview(id: string, revision: number) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`/api/design/blueprint/${id}/preview?revision=${revision}`, { cache: "no-store" })
        if (!response.ok) throw new Error(`preview_${response.status}`)
        const data = await response.json()
        const plan = data?.renderPlan
        if (plan && Array.isArray(plan.slots)) {
          setPreviewPlan({ revision: data.revision, slots: plan.slots, stages: Array.isArray(plan.stages) ? plan.stages : [] })
          return
        }
        throw new Error("preview_invalid")
      } catch {
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)))
      }
    }
    setCompileError("Preview временно недоступен. Blueprint сохранён, попробуйте открыть его ещё раз.")
  }

  async function loadEvidence(id: string) {
    try {
      const response = await fetch(`/api/design/blueprint/${id}/evidence`, { cache: "no-store" })
      if (!response.ok) return
      const data = await response.json().catch(() => null)
      if (Array.isArray(data?.evidence)) setEvidence(data.evidence as EvidenceRecord[])
      const qualityResponse = await fetch(`/api/design/blueprint/${id}/quality`, { cache: "no-store" })
      const quality = await qualityResponse.json().catch(() => null)
      if (qualityResponse.ok && Array.isArray(quality?.required)) {
        setQualityState(quality as QualityState)
        if (quality.readyForCodegen) track("blueprint_quality_ready", { blueprintId: id, revision: quality.revision, required: quality.required })
        else if (quality.missing?.length || quality.stale?.length) track("blueprint_quality_blocked", { blueprintId: id, revision: quality.revision, missing: quality.missing, stale: quality.stale?.map((item: { kind: string; reason: string }) => `${item.kind}:${item.reason}`) })
      }
    } catch {
      // Evidence is supplementary to the blueprint and must not block recovery.
    }
  }

  useEffect(() => {
    if (!generationTask) return
    let cancelled = false
    let pollTimer: number | undefined
    const schedulePoll = (delayMs: number) => {
      if (cancelled) return
      pollTimer = window.setTimeout(() => void poll(), delayMs)
    }
    const poll = async () => {
      if (cancelled) return
      let response: Response
      try {
        response = await fetch(`/api/task/${encodeURIComponent(generationTask)}`, { credentials: "include", cache: "no-store" })
      } catch {
        response = new Response(null, { status: 503 })
      }
      if (!response.ok) {
        if (cancelled) return
        generationPollFailures.current += 1
        if (generationPollFailures.current >= 3) {
          const error = "Не удалось получить статус codegen. Обновите страницу и проверьте историю blueprint."
          setGenerationStatus({ status: "failed", progress: 0, error })
          track("blueprint_codegen_failed", { taskId: generationTask, status: "poll_error", attempts: generationPollFailures.current })
          return
        }
        schedulePoll(1500 * generationPollFailures.current)
        return
      }
      const status = await response.json().catch(() => null) as GenerationStatus | null
      if (cancelled) return
      if (!status) {
        generationPollFailures.current += 1
        if (generationPollFailures.current >= 3) setGenerationStatus({ status: "failed", progress: 0, error: "Сервер вернул неполный статус codegen." })
        else schedulePoll(1500 * generationPollFailures.current)
        return
      }
      generationPollFailures.current = 0
      setGenerationStatus(status)
      const statusKey = `${status.status}:${status.currentStep || ""}:${Math.round(status.progress || 0)}`
      if (statusKey !== lastGenerationStatus.current) {
        lastGenerationStatus.current = statusKey
        track(status.status === "completed" ? "blueprint_codegen_completed" : status.status === "failed" ? "blueprint_codegen_failed" : "blueprint_codegen_progress", { taskId: generationTask, status: status.status, progress: Math.round(status.progress || 0), step: status.currentStep })
      }
      if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") return
      schedulePoll(2500)
    }
    void poll()
    return () => {
      cancelled = true
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
    }
  }, [generationTask])

  if (!hydrated) return <CofounderLoadingShell />

  async function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contractName.trim() || !brief.trim()) return
    setSubmitting(true)
    setCompileError(null)
    const startedAt = performance.now()
    track("blueprint_compile_started", { source: "cofounder", productType, preset: visualPreset })
    try {
      let aiPlan: { summary?: string; components?: string[]; risks?: string[] } | null = null
      if (user) {
        const aiResponse = await fetch("/api/design/blueprint/compile", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief }) })
        if (aiResponse.ok) {
          const aiData = await aiResponse.json().catch(() => null)
          if (Array.isArray(aiData?.blueprint?.components)) aiPlan = aiData.blueprint
        }
      }
      const response = await fetch("/api/design/blueprint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: contractName, brief, productType, preset: visualPreset, components: aiPlan?.components, aiPlan }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint?.quality) throw new Error("Не удалось собрать blueprint")
      const persistedPlan = data.blueprint.aiPlan || aiPlan
      const result: CompileResult = { id: data.blueprint.id, revision: data.blueprint.revision, score: data.blueprint.quality.score, review: data.blueprint.quality.humanReviewRequired, warnings: data.blueprint.quality.warnings, app: data.blueprint.app, brief: data.blueprint.brief, productType: data.blueprint.productType, preset: data.blueprint.preset, contractVersion: data.blueprint.contractVersion, contractHash: data.blueprint.contractHash, createdAt: data.blueprint.generatedAt, aiSummary: persistedPlan?.summary, aiComponents: persistedPlan?.components, aiRisks: persistedPlan?.risks }
      setCompileResult(result)
      setPreviewPlan(null)
      void loadPreview(result.id, result.revision)
      void loadEvidence(result.id)
      setHistory((previous) => { const next = [result, ...previous.filter((item) => item.id !== result.id)].slice(0, 5); localStorage.setItem("osgard-blueprint-history", JSON.stringify(next)); return next })
      track("blueprint_compile_completed", { source: aiPlan ? "cofounder_ai" : "cofounder_fallback", blueprintId: data.blueprint.id, revision: data.blueprint.revision, score: data.blueprint.quality.score, humanReviewRequired: data.blueprint.quality.humanReviewRequired, durationMs: Math.round(performance.now() - startedAt) })
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "Не удалось собрать blueprint")
      track("blueprint_compile_failed", { source: "cofounder", durationMs: Math.round(performance.now() - startedAt) })
    } finally {
      setSubmitting(false)
    }
  }

  async function rollbackBlueprint(item: CompileResult) {
    setRollingBack(item.revision)
    setCompileError(null)
    track("blueprint_compile_started", { source: "cofounder_rollback", blueprintId: item.id, revision: item.revision })
    try {
      const response = await fetch(`/api/design/blueprint/${item.id}/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: item.revision }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint) throw new Error("Не удалось восстановить revision")
      const persistedPlan = data.blueprint.aiPlan
      const restored: CompileResult = { id: data.blueprint.id, revision: data.blueprint.revision, score: data.blueprint.quality.score, review: data.blueprint.quality.humanReviewRequired, warnings: data.blueprint.quality.warnings, app: data.blueprint.app, brief: data.blueprint.brief, productType: data.blueprint.productType || item.productType, preset: data.blueprint.preset || item.preset, contractVersion: data.blueprint.contractVersion || item.contractVersion, contractHash: data.blueprint.contractHash || item.contractHash, createdAt: data.blueprint.generatedAt, aiSummary: persistedPlan?.summary || item.aiSummary, aiComponents: persistedPlan?.components || item.aiComponents, aiRisks: persistedPlan?.risks || item.aiRisks }
      setCompileResult(restored)
      setPreviewPlan(null)
      void loadPreview(restored.id, restored.revision)
      void loadEvidence(restored.id)
      setContractName(restored.app)
      setBrief(restored.brief)
      if (restored.productType) setProductType(restored.productType)
      if (restored.preset) setVisualPreset(restored.preset)
      setHistory((previous) => { const next = [restored, ...previous.filter((entry) => entry.id !== restored.id || entry.revision !== restored.revision)].slice(0, 5); localStorage.setItem("osgard-blueprint-history", JSON.stringify(next)); return next })
      track("blueprint_compile_completed", { source: "cofounder_rollback", blueprintId: restored.id, fromRevision: item.revision, revision: restored.revision, score: restored.score })
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "Не удалось восстановить revision")
      track("blueprint_compile_failed", { source: "cofounder_rollback", blueprintId: item.id, revision: item.revision })
    } finally {
      setRollingBack(null)
    }
  }

  async function approvePreview(item: CompileResult) {
    setApproving(true)
    setCompileError(null)
    try {
      const response = await fetch(`/api/design/blueprint/${item.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: item.revision }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint) throw new Error("Не удалось подтвердить preview")
      const approved = data.blueprint
      const next: CompileResult = { id: approved.id, revision: approved.revision, score: approved.quality.score, review: approved.quality.humanReviewRequired, warnings: approved.quality.warnings, app: approved.app, brief: approved.brief, productType: approved.productType || item.productType, preset: approved.preset || item.preset, contractVersion: approved.contractVersion || item.contractVersion, contractHash: approved.contractHash || item.contractHash, createdAt: approved.generatedAt, aiSummary: approved.aiPlan?.summary || item.aiSummary, aiComponents: approved.aiPlan?.components || item.aiComponents, aiRisks: approved.aiPlan?.risks || item.aiRisks, approved: approved.approval?.status === "approved" }
      setCompileResult(next)
      void loadEvidence(next.id)
      setHistory((previous) => { const updated = [next, ...previous.filter((entry) => entry.id !== next.id || entry.revision !== next.revision)].slice(0, 5); localStorage.setItem("osgard-blueprint-history", JSON.stringify(updated)); return updated })
      track("blueprint_compile_completed", { source: "cofounder_approval", blueprintId: next.id, fromRevision: item.revision, revision: next.revision })
      track("blueprint_approval_completed", { blueprintId: next.id, fromRevision: item.revision, revision: next.revision })
    } catch (error) { setCompileError(error instanceof Error ? error.message : "Не удалось подтвердить preview") } finally { setApproving(false) }
  }

  async function launchCodegen(item: CompileResult) {
    setGenerating(true)
    setCompileError(null)
    try {
      const response = await fetch(`/api/design/blueprint/${item.id}/generate`, { method: "POST", credentials: "include" })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.taskId) { track("blueprint_codegen_blocked", { blueprintId: item.id, revision: item.revision, reason: data?.error || `http_${response.status}`, missing: data?.missing }); throw new Error(data?.error === "blueprint_approval_required" ? "Сначала подтвердите preview" : "Не удалось запустить codegen") }
      setGenerationTask(data.taskId)
      setGenerationStatus({ status: "queued", progress: 0 })
      generationPollFailures.current = 0
      lastGenerationStatus.current = "queued:"
      track("blueprint_codegen_started", { source: "cofounder", taskId: data.taskId, blueprintId: item.id, revision: item.revision })
      track("blueprint_compile_completed", { source: "cofounder_codegen", blueprintId: item.id, revision: item.revision, taskId: data.taskId })
    } catch (error) { setCompileError(error instanceof Error ? error.message : "Не удалось запустить codegen") } finally { setGenerating(false) }
  }

  async function shareBlueprint(item: CompileResult) {
    const title = `OSGARD mission replay: ${item.app}`
    const text = `${item.app} assembled in OSGARD AI Cofounder: ${item.productType || "product"}, ${item.preset || "futuristic"} preset, ${item.score}/100 blueprint quality.`
    const replayUrl = `${window.location.origin}/cofounder/replay/${item.id}?revision=${item.revision}`
    const supportsNativeShare = "share" in navigator
    try {
      if (supportsNativeShare) {
        await navigator.share({ title, text, url: replayUrl })
        setShareStatus("Mission replay shared")
      } else {
        await navigator.clipboard.writeText(`${text} ${replayUrl}`)
        setShareStatus("Replay link copied")
      }
      track("blueprint_shared", { blueprintId: item.id, revision: item.revision, channel: supportsNativeShare ? "native" : "clipboard" })
    } catch { setShareStatus("Share cancelled") }
    window.setTimeout(() => setShareStatus(null), 2600)
  }

  function chooseStarterMission(mission: (typeof starterMissions)[number]) {
    setBrief(mission.brief)
    track("blueprint_starter_selected", { mission: mission.id, productType, preset: visualPreset })
  }

  const deliveryStages: SequenceStage[] = [
    { label: "Идея", detail: brief.trim() ? "Контекст принят" : "Опишите результат", status: brief.trim() ? "complete" : "active" as const },
    { label: "Blueprint", detail: compileResult ? `Revision ${compileResult.revision} собрана` : submitting ? "Собираем архитектуру" : "Следующий шаг после brief", status: compileResult ? "complete" : submitting ? "active" : "pending" as const },
    { label: "Preview", detail: previewPlan ? "План интерфейса готов" : compileResult ? "Откройте контракт для preview" : "Появится после blueprint", status: previewPlan ? "complete" : compileResult ? "active" : "pending" as const },
    { label: "Проверка", detail: qualityState?.readyForCodegen ? "Evidence подтверждены" : previewPlan ? "Проверяем доступность и риски" : "Ожидает preview", status: qualityState?.readyForCodegen ? "complete" : previewPlan ? "active" : "pending" as const },
    { label: "Публикация", detail: generationStatus?.status === "completed" ? "Приложение готово" : compileResult?.approved ? "Можно запускать codegen" : "Требует approval", status: generationStatus?.status === "completed" ? "complete" : compileResult?.approved ? "active" : "pending" as const },
  ]

  return (
    <main className="ds-body cofounder-cosmos" style={{ minHeight: "100vh", padding: "clamp(1rem, 4vw, 4rem)" }}>
      <ObsidianCosmos />
      <CosmicCursor />
      <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)", display: "flex", justifyContent: "space-between", gap: "2rem", alignItems: "end" }}>
        <div>
          <span className="ds-utility"><Radar size={14} /> AI COFOUNDER / COMMAND DECK</span>
          <h1 className="ds-display" style={{ fontSize: "clamp(2rem, 6vw, 5rem)", margin: ".5rem 0" }}>AI Cofounder</h1>
          <p style={{ color: "var(--ds-muted)" }}>Контракты продукта, доказательства и ручные согласования в одном контуре.</p>
        </div>
        <PresetSwitcher />
      </section>
      <MemoryLayerRail counts={{ Atomic: 12, Semantic: 8, Episodic: 4, Procedural: 3 }} />
      <ProductCatalog productType={productType} preset={visualPreset} onProductTypeChange={setProductType} onPresetChange={setVisualPreset} />
      <OrbitalMemory />
      <CinematicSequence stages={deliveryStages} />
      <BlueprintCanvas plan={previewPlan as BlueprintCanvasPlan | null} productType={productType} preset={visualPreset} onCreate={() => setOpen(true)} />
      <section className="ds-hull ds-glass" style={{ padding: "clamp(1.25rem, 4vw, 3rem)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <div><span className="ds-utility">РАБОЧИЙ ОТСЕК</span><h2 className="ds-display">Контролируемая доставка</h2><p style={{ color: "var(--ds-muted)" }}>Ожидаемый результат, доказательства и ручное согласование в одном контуре.</p></div>
          <ShieldCheck aria-hidden="true" />
        </header>
        <button type="button" className="ds-liquid-gold ds-interactive ds-focus" style={{ marginTop: "1.5rem" }} onClick={() => setOpen(true)} aria-haspopup="dialog" title="Open the product brief and start a verified blueprint"><Gem size={17} aria-hidden="true" /> Создать контракт</button>
      </section>
      <dialog ref={dialogRef} className="ds-contract-dialog" aria-label="НОВЫЙ КОНТРАКТ" aria-labelledby="new-contract" onClose={() => setOpen(false)}>
        <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="ds-dialog-close"><X size={18} /></button>
        <span className="ds-utility">AI COFOUNDER / NEW DELIVERY</span>
        <h2 id="new-contract" className="ds-display">НОВЫЙ КОНТРАКТ</h2>
        <p className="ds-dialog-copy">Опишите первый продуктовый шаг. Система сохранит контекст и предложит план доставки.</p>
        <form onSubmit={submitContract}>
          {compileResult && (compileResult.aiSummary || compileResult.aiComponents?.length || compileResult.aiRisks?.length) ? <section className="ds-dialog-result" aria-label="AI architecture signal"><strong>AI architecture signal</strong>{compileResult.aiSummary ? <span>{compileResult.aiSummary}</span> : null}{compileResult.aiComponents?.length ? <small>Selected components: {compileResult.aiComponents.join(", ")}</small> : null}{compileResult.aiRisks?.length ? <small>Risks to review: {compileResult.aiRisks.join("; ")}</small> : null}</section> : null}
          <label className="ds-field">Название<input required value={contractName} onChange={(event) => setContractName(event.target.value)} placeholder="Например, кабинет партнёра" /></label>
          <section className="ds-brief-starters" aria-labelledby="starter-missions-title"><div className="ds-brief-starters__head"><Lightbulb size={15} aria-hidden="true" /><span id="starter-missions-title" className="ds-utility">STARTER MISSIONS</span><small>Начните с готового вектора</small></div><div className="ds-brief-starters__grid">{starterMissions.map((mission) => <button key={mission.id} type="button" className="ds-brief-starter ds-focus" onClick={() => chooseStarterMission(mission)} aria-label={`Use starter mission: ${mission.label}`} title="Fill the brief with this starting direction"><strong>{mission.label}</strong><span>{mission.brief}</span></button>)}</div></section>
          <label className="ds-field">Результат для проверки<textarea required rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Какой результат должен быть готов?" /></label>
          <p className="ds-dialog-live" role="status" aria-live="polite" aria-atomic="true">{submitting ? "Собираем blueprint…" : compileResult ? "Blueprint готов к проверке." : ""}</p>
          {compileError ? <p role="alert" className="ds-dialog-error">{compileError}</p> : null}
          {previewPlan ? <section className="ds-dialog-preview" aria-label="Blueprint preview"><div className="ds-utility">LIVE PREVIEW / REVISION {previewPlan.revision}</div><div className="ds-dialog-preview-slots">{previewPlan.slots.map((slot) => <article key={slot.id} className="ds-dialog-preview-slot"><strong>{slot.component}</strong><span>{slot.role}</span><small>{slot.states.join(" · ")}</small></article>)}</div><div className="ds-dialog-preview-stages" aria-label="Preview stages">{previewPlan.stages.map((stage, index) => <span key={stage} data-active={index === 0}>{stage}</span>)}</div></section> : null}
          {compileResult ? <div className="ds-dialog-result" role="status"><strong>Blueprint готов: {compileResult.score}/100</strong><span>{compileResult.review ? "Нужна ручная проверка перед публикацией." : "Можно переходить к preview."}</span>{compileResult.contractHash ? <small>Contract evidence: {compileResult.contractHash.slice(0, 12)}…</small> : null}{compileResult.warnings.length ? <small>{compileResult.warnings.length} предупреждения требуют внимания</small> : null}</div> : null}
          {compileResult ? <section className="ds-mission-replay" aria-label="Mission replay"><div><span className="ds-utility">MISSION REPLAY / OSGARD</span><strong>{compileResult.app}</strong><small>{compileResult.productType || "product"} · {compileResult.preset || "futuristic"} · revision {compileResult.revision}</small></div><div className="ds-mission-replay__score"><b>{compileResult.score}</b><span>quality</span></div><button type="button" className="ds-dialog-secondary ds-share-button" onClick={() => void shareBlueprint(compileResult)}><Share2 size={15} /> Share replay</button>{shareStatus ? <p role="status" className="ds-share-status">{shareStatus}</p> : null}</section> : null}
          {compileResult ? <section className="ds-evidence-ledger" aria-label="Evidence ledger"><div className="ds-evidence-ledger__head"><span className="ds-utility">EVIDENCE LEDGER</span><small>{evidence.length ? `${evidence.length} recorded checks` : "No checks recorded yet"}</small></div>{qualityState?.missing.length ? <p className="ds-evidence-ledger__missing">Missing gates: {qualityState.missing.join(", ")}</p> : null}{qualityState?.stale.length ? <p className="ds-evidence-ledger__stale">Stale evidence: {qualityState.stale.map((item) => `${item.kind} (${item.reason})`).join(", ")}</p> : null}{qualityState && !qualityState.missing.length && !qualityState.stale.length ? <p className="ds-evidence-ledger__ready">{qualityState.readyForCodegen ? "Verified and ready for codegen" : "All technical gates passed; awaiting approval"}</p> : null}{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><i data-status={item.status} aria-hidden="true" /><span><strong>{item.kind}</strong><small>{item.summary}</small></span><em>{item.status}</em></li>)}</ul> : <p>Quality gates appear here as soon as a verified check is captured.</p>}</section> : null}
          {history.length > 1 ? <div className="ds-dialog-history" aria-label="История blueprint"><span className="ds-utility">ПРОШЛЫЕ ВЕРСИИ</span>{history.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => { setCompileResult(item); setContractName(item.app); setBrief(item.brief); if (item.productType) setProductType(item.productType); if (item.preset) setVisualPreset(item.preset) }} aria-label={`Открыть blueprint ${item.app}`}>{item.app} · {item.score}/100</button>)}</div> : null}
          {compileResult ? <button type="button" className="ds-dialog-secondary" onClick={() => approvePreview(compileResult)} disabled={approving || rollingBack !== null} title="Approve this revision so code generation can start">{approving ? "Подтверждаем…" : "Подтвердить preview для codegen"}</button> : null}
          {compileResult?.approved ? <button type="button" className="ds-dialog-primary" onClick={() => void launchCodegen(compileResult)} disabled={generating} title="Generate the application from the approved blueprint">{generating ? "Запускаем codegen…" : "Запустить codegen"}</button> : null}
          {generationTask ? <p className="ds-dialog-live" role="status">Generation task: {generationTask}</p> : null}
          {generationStatus ? <section className="ds-dialog-generation" aria-label="Code generation progress"><div className="ds-dialog-generation-head"><strong>{generationStatus.status === "completed" ? "Codegen complete" : generationStatus.status === "failed" ? "Codegen failed" : "Codegen in progress"}</strong><span>{Math.round(generationStatus.progress || 0)}%</span></div><div className="ds-dialog-generation-bar"><span style={{ width: `${Math.min(100, Math.max(0, generationStatus.progress || 0))}%` }} /></div>{generationStatus.currentStep ? <small>{generationStatus.currentStep}</small> : null}{generationStatus.error ? <small role="alert">{generationStatus.error}</small> : null}{generationStatus.result ? <div className="ds-dialog-generation-links">{generationStatus.result.previewUrl ? <a href={generationStatus.result.previewUrl} target="_blank" rel="noreferrer">Open preview</a> : null}{generationStatus.result.appUrl ? <a href={generationStatus.result.appUrl} target="_blank" rel="noreferrer">Open app</a> : null}{generationStatus.result.repoUrl ? <a href={generationStatus.result.repoUrl} target="_blank" rel="noreferrer">Open repository</a> : null}</div> : null}</section> : null}
          {compileResult ? <button type="button" className="ds-dialog-secondary" onClick={() => rollbackBlueprint(compileResult)} disabled={rollingBack !== null} title="Restore this saved blueprint revision">{rollingBack === compileResult.revision ? "Восстанавливаем…" : `Восстановить revision ${compileResult.revision}`}</button> : null}
          <div className="ds-dialog-actions">
            <button type="button" className="ds-dialog-secondary" onClick={() => setOpen(false)}>Отмена</button>
            <button type="submit" className="ds-dialog-primary" disabled={submitting}><FilePlus2 size={16} /> {submitting ? "Собираем…" : "Создать план"}</button>
          </div>
        </form>
      </dialog>
    </main>
  )
}
