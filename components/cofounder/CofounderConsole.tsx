"use client"

import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { FilePlus2, Gem, Lightbulb, Mic, MicOff, Radar, RefreshCw, ShieldCheck, Share2, Wand2, X } from "lucide-react"
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
import { StoryboardRail } from "@/components/cofounder/StoryboardRail"

type ProductIntent = { audience: string; outcome: string; platform: "web" | "mobile" | "desktop" | "cross-platform" | "any"; constraints: string[] }
type CompileResult = { id: string; revision: number; score: number; review: boolean; warnings: string[]; app: string; brief: string; intent?: ProductIntent; productType?: ProductType; preset?: VisualPreset; contractVersion?: string; contractHash?: string; createdAt: string; aiSummary?: string; aiComponents?: string[]; aiRisks?: string[]; approved?: boolean; evidenceToken?: string }
type PreviewPlan = { revision: number; slots: { id: string; component: string; role: string; states: string[] }[]; stages: string[] }
type EvidenceRecord = { id: string; revision: number; kind: string; status: "passed" | "failed" | "skipped"; summary: string; source: string; capturedAt: string; contractHash: string }
type QualityState = { required: string[]; missing: string[]; stale: { kind: string; reason: string; revision?: number; expectedRevision: number }[]; approval: boolean; delivery?: boolean; readyForCodegen: boolean }
type GenerationStatus = { status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress: number; currentStep?: string; error?: string; result?: { appUrl?: string; previewUrl?: string; repoUrl?: string } }
type DeliveryProvider = "osgard-cluster" | "vercel" | "netlify" | "custom"
type DeliveryPreflight = { ready: boolean; checks: { id: string; status: "passed" | "failed" | "manual" | "not-requested" | "blocked"; label: string }[] }
type CommandDiff = { slotId: string; role: string; before: string; after: string }
type CommandPreview = { intent: string; changes: CommandDiff[]; contractHash: string; revision: number }
type ApprovalComment = { id: string; revision: number; author: string; body: string; createdAt: string }
type DeliveryIntegration = { id: number; connectorId: string; connectorName: string; name: string; status: string; lastTestStatus?: string | null }

const evidenceLabels: Record<string, string> = {
  security: "Security review",
  performance: "Performance budget",
  a11y: "Accessibility",
  "visual-diff": "Visual regression",
  deploy: "Deployment check",
}

const starterMissions = [
  { id: "launch", label: "Launch a product", brief: "Create a focused product workspace where a team can move from idea to a verified first release in one session." },
  { id: "community", label: "Build a community", brief: "Create a trusted community experience with profiles, a live feed, moderation signals, and a clear first contribution path." },
  { id: "ai-operator", label: "Ship an AI operator", brief: "Create an AI operator with durable memory, transparent evidence, and a safe approval step before code is generated." },
] as const
const GENERATION_STATE_KEY = "osgard-latest-generation"

export function CofounderConsole() {
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false)
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [contractName, setContractName] = useState("")
  const [brief, setBrief] = useState("")
  const [intentAudience, setIntentAudience] = useState("")
  const [intentOutcome, setIntentOutcome] = useState("")
  const [intentConstraints, setIntentConstraints] = useState("")
  const [productType, setProductType] = useState<ProductType>("application")
  const [visualPreset, setVisualPreset] = useState<VisualPreset>("futuristic")
  const [deliveryProvider, setDeliveryProvider] = useState<DeliveryProvider>("osgard-cluster")
  const [deliveryDomain, setDeliveryDomain] = useState("")
  const [supabaseProjectRef, setSupabaseProjectRef] = useState("")
  const [deliveryIntegrations, setDeliveryIntegrations] = useState<DeliveryIntegration[]>([])
  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<number[]>([])
  const [deliveryPreflight, setDeliveryPreflight] = useState<DeliveryPreflight | null>(null)
  const [commandText, setCommandText] = useState("")
  const [commandPreview, setCommandPreview] = useState<CommandPreview | null>(null)
  const [voiceListening, setVoiceListening] = useState(false)
  const speechRecognitionRef = useRef<any>(null)
  const [commandBusy, setCommandBusy] = useState(false)
  const [approvalComments, setApprovalComments] = useState<ApprovalComment[]>([])
  const [commentDraft, setCommentDraft] = useState("")
  const [commentBusy, setCommentBusy] = useState(false)
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
  const [savingCanvas, setSavingCanvas] = useState(false)
  const [refreshingEvidence, setRefreshingEvidence] = useState(false)
  const lastGenerationStatus = useRef<string | null>(null)
  const generationPollFailures = useRef(0)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!user) return
    void fetch("/api/integrations", { credentials: "include", cache: "no-store" }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json().catch(() => null)
      if (Array.isArray(data?.integrations)) setDeliveryIntegrations(data.integrations as DeliveryIntegration[])
    }).catch(() => undefined)
  }, [user])

  const persistGenerationState = useCallback((status: GenerationStatus, taskId: string, blueprintId = compileResult?.id, revision = compileResult?.revision) => {
    if (typeof window === "undefined") return
    try { localStorage.setItem(GENERATION_STATE_KEY, JSON.stringify({ ...status, taskId, blueprintId, revision, updatedAt: new Date().toISOString() })) } catch { /* optional storage */ }
  }, [compileResult?.id, compileResult?.revision])

  const persistGenerationRemote = useCallback((status: GenerationStatus, taskId: string, blueprintId = compileResult?.id, revision = compileResult?.revision) => {
    if (!compileResult?.evidenceToken || !blueprintId || !revision) return
    void fetch(`/api/design/blueprint/${encodeURIComponent(blueprintId)}/generation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...status, taskId, revision, evidenceToken: compileResult.evidenceToken }) }).catch(() => undefined)
  }, [compileResult])

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

  function retryPreview() {
    if (!compileResult) return
    setCompileError(null)
    void loadPreview(compileResult.id, compileResult.revision)
  }

  async function loadEvidence(id: string) {
    const [evidenceResult, qualityResult, commentsResult] = await Promise.allSettled([
      fetch(`/api/design/blueprint/${id}/evidence`, { cache: "no-store" }),
      fetch(`/api/design/blueprint/${id}/quality`, { cache: "no-store" }),
      fetch(`/api/design/blueprint/${id}/comments`, { cache: "no-store" }),
    ])
    if (evidenceResult.status === "fulfilled" && evidenceResult.value.ok) {
      const data = await evidenceResult.value.json().catch(() => null)
      if (Array.isArray(data?.evidence)) setEvidence(data.evidence as EvidenceRecord[])
    }
    if (qualityResult.status === "fulfilled" && qualityResult.value.ok) {
      const quality = await qualityResult.value.json().catch(() => null)
      if (Array.isArray(quality?.required)) {
        setQualityState(quality as QualityState)
        if (quality.readyForCodegen) track("blueprint_quality_ready", { blueprintId: id, revision: quality.revision, required: quality.required })
        else if (quality.missing?.length || quality.stale?.length) track("blueprint_quality_blocked", { blueprintId: id, revision: quality.revision, missing: quality.missing, stale: quality.stale?.map((item: { kind: string; reason: string }) => `${item.kind}:${item.reason}`) })
      }
    }
    if (commentsResult.status === "fulfilled" && commentsResult.value.ok) {
      const data = await commentsResult.value.json().catch(() => null)
      if (Array.isArray(data?.comments)) setApprovalComments(data.comments as ApprovalComment[])
    }
  }

  async function addApprovalComment() {
    if (!compileResult?.evidenceToken || commentDraft.trim().length < 2) return
    setCommentBusy(true)
    try {
      const response = await fetch(`/api/design/blueprint/${compileResult.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: compileResult.revision, comment: commentDraft, author: user?.displayName || user?.username || user?.email || "OSGARD collaborator", evidenceToken: compileResult.evidenceToken }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.comment) throw new Error("Не удалось сохранить комментарий")
      setApprovalComments((current) => [...current, data.comment as ApprovalComment].slice(-100))
      setCommentDraft("")
    } catch (error) { setCompileError(error instanceof Error ? error.message : "Не удалось сохранить комментарий") } finally { setCommentBusy(false) }
  }

  async function refreshEvidence() {
    if (!compileResult) return
    setRefreshingEvidence(true)
    try {
      await loadEvidence(compileResult.id)
    } finally {
      setRefreshingEvidence(false)
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
          const failed = { status: "failed" as const, progress: 0, error }
          setGenerationStatus(failed)
          persistGenerationState(failed, generationTask)
          persistGenerationRemote(failed, generationTask)
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
        if (generationPollFailures.current >= 3) { const failed = { status: "failed" as const, progress: 0, error: "Сервер вернул неполный статус codegen." }; setGenerationStatus(failed); persistGenerationState(failed, generationTask); persistGenerationRemote(failed, generationTask) }
        else schedulePoll(1500 * generationPollFailures.current)
        return
      }
      generationPollFailures.current = 0
      setGenerationStatus(status)
      persistGenerationState(status, generationTask)
      persistGenerationRemote(status, generationTask)
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
  }, [generationTask, persistGenerationRemote, persistGenerationState])

  if (!hydrated) return <CofounderLoadingShell />

  async function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contractName.trim() || !intentAudience.trim() || !intentOutcome.trim()) return
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
      const normalizedBrief = [brief.trim(), `Audience: ${intentAudience.trim()}`, `Outcome: ${intentOutcome.trim()}`, intentConstraints.trim() ? `Constraints: ${intentConstraints.trim()}` : ""].filter(Boolean).join("\n")
      const intent: ProductIntent = { audience: intentAudience.trim(), outcome: intentOutcome.trim(), platform: "any", constraints: intentConstraints.split(",").map((item) => item.trim()).filter(Boolean) }
      const response = await fetch("/api/design/blueprint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: contractName, brief: normalizedBrief, intent, productType, preset: visualPreset, components: aiPlan?.components, aiPlan }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint?.quality) throw new Error("Не удалось собрать blueprint")
      const persistedPlan = data.blueprint.aiPlan || aiPlan
      const result: CompileResult = { id: data.blueprint.id, revision: data.blueprint.revision, score: data.blueprint.quality.score, review: data.blueprint.quality.humanReviewRequired, warnings: data.blueprint.quality.warnings, app: data.blueprint.app, brief: data.blueprint.brief, intent: data.blueprint.intent, productType: data.blueprint.productType, preset: data.blueprint.preset, contractVersion: data.blueprint.contractVersion, contractHash: data.blueprint.contractHash, createdAt: data.blueprint.generatedAt, aiSummary: persistedPlan?.summary, aiComponents: persistedPlan?.components, aiRisks: persistedPlan?.risks, evidenceToken: data.evidenceToken }
      const deliveryResponse = await fetch(`/api/design/blueprint/${data.blueprint.id}/delivery`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: data.blueprint.revision, provider: deliveryProvider, domain: deliveryDomain || undefined, supabaseProjectRef: supabaseProjectRef || undefined, integrationIds: selectedIntegrationIds, evidenceToken: data.evidenceToken }) })
      const deliveryData = await deliveryResponse.json().catch(() => null)
      if (!deliveryResponse.ok) throw new Error("Не удалось сохранить delivery policy")
      if (deliveryData?.preflight && Array.isArray(deliveryData.preflight.checks)) {
        setDeliveryPreflight(deliveryData.preflight as DeliveryPreflight)
          track("delivery_preflight_viewed", { provider: deliveryProvider, hasCustomDomain: Boolean(deliveryDomain.trim()), hasSupabase: Boolean(supabaseProjectRef.trim()) })
      }
      const verificationResponse = await fetch(`/api/design/blueprint/${data.blueprint.id}/delivery/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: data.blueprint.revision, evidenceToken: data.evidenceToken }) })
      const verification = await verificationResponse.json().catch(() => null)
      if (verificationResponse.ok && Array.isArray(verification?.checks)) setDeliveryPreflight(verification as DeliveryPreflight)
      track("blueprint_delivery_policy_saved", { blueprintId: data.blueprint.id, revision: data.blueprint.revision, provider: deliveryProvider, hasCustomDomain: Boolean(deliveryDomain.trim()), hasSupabase: Boolean(supabaseProjectRef.trim()) })
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
      const restored: CompileResult = { id: data.blueprint.id, revision: data.blueprint.revision, score: data.blueprint.quality.score, review: data.blueprint.quality.humanReviewRequired, warnings: data.blueprint.quality.warnings, app: data.blueprint.app, brief: data.blueprint.brief, productType: data.blueprint.productType || item.productType, preset: data.blueprint.preset || item.preset, contractVersion: data.blueprint.contractVersion || item.contractVersion, contractHash: data.blueprint.contractHash || item.contractHash, createdAt: data.blueprint.generatedAt, aiSummary: persistedPlan?.summary || item.aiSummary, aiComponents: persistedPlan?.components || item.aiComponents, aiRisks: persistedPlan?.risks || item.aiRisks, evidenceToken: item.evidenceToken }
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
      const next: CompileResult = { id: approved.id, revision: approved.revision, score: approved.quality.score, review: approved.quality.humanReviewRequired, warnings: approved.quality.warnings, app: approved.app, brief: approved.brief, productType: approved.productType || item.productType, preset: approved.preset || item.preset, contractVersion: approved.contractVersion || item.contractVersion, contractHash: approved.contractHash || item.contractHash, createdAt: approved.generatedAt, aiSummary: approved.aiPlan?.summary || item.aiSummary, aiComponents: approved.aiPlan?.components || item.aiComponents, aiRisks: approved.aiPlan?.risks || item.aiRisks, approved: approved.approval?.status === "approved", evidenceToken: item.evidenceToken }
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
      const queued = { status: "queued" as const, progress: 0 }
      setGenerationStatus(queued)
      persistGenerationState(queued, data.taskId, item.id, item.revision)
      persistGenerationRemote(queued, data.taskId, item.id, item.revision)
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
    if (!contractName.trim()) setContractName(mission.label)
    setBrief(mission.brief)
    setIntentAudience("Product teams and their customers")
    setIntentOutcome(mission.brief)
    setIntentConstraints("")
    track("blueprint_starter_selected", { mission: mission.id, productType, preset: visualPreset })
  }

  function evidenceLabel(kind: string) {
    return evidenceLabels[kind] || kind.replace(/[-_]/g, " ")
  }

  function toggleVoiceCommand() {
    if (voiceListening) {
      speechRecognitionRef.current?.stop?.()
      setVoiceListening(false)
      return
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setCompileError("Голосовой ввод не поддерживается этим браузером")
      track("blueprint_voice_command_unavailable", {})
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = "ru-RU"
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => { setVoiceListening(true); track("blueprint_voice_command_started", {}) }
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim()
      if (transcript) { setCommandText((current) => current ? `${current} ${transcript}` : transcript); track("blueprint_voice_command_captured", { characters: transcript.length }) }
    }
    recognition.onerror = () => { setCompileError("Не удалось распознать голосовую команду"); track("blueprint_voice_command_error", {}) }
    recognition.onend = () => { setVoiceListening(false); speechRecognitionRef.current = null }
    speechRecognitionRef.current = recognition
    recognition.start()
  }

  async function saveCanvasDraft(slots: { id: string; component: string; role: string; states: string[] }[]) {
    if (!compileResult?.evidenceToken) return
    setSavingCanvas(true)
    try {
      const response = await fetch(`/api/design/blueprint/${compileResult.id}/edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: compileResult.revision, evidenceToken: compileResult.evidenceToken, slots }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint) throw new Error("Не удалось сохранить revision canvas")
      const next = { ...compileResult, revision: data.blueprint.revision, contractHash: data.blueprint.contractHash, score: data.blueprint.quality.score, review: data.blueprint.quality.humanReviewRequired, approved: false }
      setCompileResult(next)
      setPreviewPlan(null)
      void loadPreview(next.id, next.revision)
      void loadEvidence(next.id)
      setCompileError(null)
      track("blueprint_canvas_revision_saved", { blueprintId: next.id, revision: next.revision })
    } catch (error) { setCompileError(error instanceof Error ? error.message : "Не удалось сохранить revision canvas") } finally { setSavingCanvas(false) }
  }

  async function previewCommand() {
    if (!compileResult || commandText.trim().length < 3) return
    setCommandBusy(true)
    setCompileError(null)
    try {
      const response = await fetch(`/api/design/blueprint/${compileResult.id}/command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: compileResult.revision, command: commandText, dryRun: true }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(data?.changes)) throw new Error(data?.error === "command_not_supported" ? "Команда пока не поддерживается. Попробуйте: «сделай карточки плотнее», «добавь Stripe» или «сделай мобильную версию»." : "Не удалось построить explainable diff")
      setCommandPreview({ intent: data.intent, changes: data.changes, contractHash: data.contractHash, revision: data.revision })
      track("blueprint_command_dry_run", { blueprintId: compileResult.id, revision: compileResult.revision, intent: data.intent, changes: data.changes.length })
    } catch (error) { setCompileError(error instanceof Error ? error.message : "Не удалось проверить команду") } finally { setCommandBusy(false) }
  }

  async function applyCommand() {
    if (!compileResult || !commandPreview?.changes.length || !compileResult.evidenceToken) return
    setCommandBusy(true)
    try {
      const response = await fetch(`/api/design/blueprint/${compileResult.id}/command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: compileResult.revision, command: commandText, dryRun: false, evidenceToken: compileResult.evidenceToken }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.blueprint) throw new Error("Не удалось применить команду")
      const next: CompileResult = { ...compileResult, revision: data.blueprint.revision, contractHash: data.blueprint.contractHash, score: data.blueprint.quality.score, review: true, approved: false }
      setCompileResult(next)
      setCommandPreview(null)
      setCommandText("")
      setPreviewPlan(null)
      void loadPreview(next.id, next.revision)
      void loadEvidence(next.id)
      track("blueprint_command_applied", { blueprintId: next.id, revision: next.revision, intent: data.intent, changes: data.changes?.length || 0 })
    } catch (error) { setCompileError(error instanceof Error ? error.message : "Не удалось применить команду") } finally { setCommandBusy(false) }
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
      <BlueprintCanvas key={previewPlan?.revision ?? "empty"} plan={previewPlan as BlueprintCanvasPlan | null} productType={productType} preset={visualPreset} onCreate={() => setOpen(true)} onSave={saveCanvasDraft} saving={savingCanvas} />
      <section className="ds-hull ds-glass ds-command-panel" aria-labelledby="command-title">
        <div className="ds-command-panel__head"><div><span className="ds-utility">NATURAL LANGUAGE EDITOR</span><h2 id="command-title" className="ds-display">Скажите, что изменить</h2><p>Сначала увидите explainable diff. Ничего не применится без вашего подтверждения.</p></div><Wand2 size={18} aria-hidden="true" /></div>
        <div className="ds-command-panel__form"><label className="ds-field"><span className="sr-only">Команда изменения</span><input value={commandText} onChange={(event) => setCommandText(event.target.value)} placeholder="Например: сделай карточки плотнее" maxLength={500} disabled={!compileResult || commandBusy} /><button type="button" className="ds-dialog-secondary ds-focus" onClick={toggleVoiceCommand} disabled={!compileResult || commandBusy} aria-label={voiceListening ? "Остановить голосовой ввод" : "Ввести команду голосом"} title={voiceListening ? "Остановить голосовой ввод" : "Ввести команду голосом"}>{voiceListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}</button><button type="button" className="ds-dialog-secondary ds-focus" onClick={() => void previewCommand()} disabled={!compileResult || commandBusy || commandText.trim().length < 3}>{commandBusy ? "Проверяем…" : "Показать diff"}</button></label></div>
        {!compileResult ? <small className="ds-field-hint">Сначала создайте blueprint, затем редактируйте его обычной фразой.</small> : null}
        {commandPreview ? <div className="ds-command-diff" role="status"><div className="ds-command-diff__meta"><strong>{commandPreview.intent}</strong><span>{commandPreview.changes.length} changes · revision {commandPreview.revision}</span></div><ul>{commandPreview.changes.map((change) => <li key={change.slotId}><strong>{change.role}</strong><span className="ds-command-diff__before">{change.before || "empty"}</span><span aria-hidden="true">→</span><span className="ds-command-diff__after">{change.after}</span></li>)}</ul><button type="button" className="ds-liquid-gold ds-focus" onClick={() => void applyCommand()} disabled={commandBusy}>Применить изменения</button></div> : null}
      </section>
      <StoryboardRail plan={previewPlan} approved={Boolean(compileResult?.approved)} />
      {compileResult ? <section className="ds-hull ds-glass ds-approval-room" aria-labelledby="approval-room-title"><div className="ds-command-panel__head"><div><span className="ds-utility">APPROVAL ROOM / REVISION {compileResult.revision}</span><h2 id="approval-room-title" className="ds-display">Решения команды</h2><p>Комментарии привязаны к revision и попадают в Mission Replay.</p></div><ShieldCheck size={18} aria-hidden="true" /></div><div className="ds-approval-room__comments">{approvalComments.length ? approvalComments.map((comment) => <article key={comment.id}><div><strong>{comment.author}</strong><small>{new Date(comment.createdAt).toLocaleString()}</small></div><p>{comment.body}</p></article>) : <p className="ds-field-hint">Пока нет комментариев к этой revision.</p>}</div><div className="ds-approval-room__composer"><label className="ds-field"><span className="sr-only">Комментарий к revision</span><textarea rows={2} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Оставьте решение, риск или вопрос для approval room" maxLength={1_000} disabled={commentBusy} /></label><button type="button" className="ds-dialog-secondary ds-focus" onClick={() => void addApprovalComment()} disabled={commentBusy || commentDraft.trim().length < 2}>{commentBusy ? "Сохраняем…" : "Добавить комментарий"}</button></div></section> : null}
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
        <section className="ds-interview" aria-labelledby="interview-title">
          <div className="ds-brief-starters__head"><Lightbulb size={15} aria-hidden="true" /><span id="interview-title" className="ds-utility">THREE-QUESTION INTERVIEW</span><small>Ответы становятся частью ProductContract</small></div>
          <label className="ds-field">Audience<input required maxLength={240} value={intentAudience} onChange={(event) => setIntentAudience(event.target.value)} placeholder="Кто будет пользоваться продуктом?" /></label>
          <label className="ds-field">Outcome<input required maxLength={320} value={intentOutcome} onChange={(event) => { const value = event.target.value; setIntentOutcome(value); if (!brief.trim()) setBrief(value) }} placeholder="Какой результат должен быть готов?" /></label>
          <label className="ds-field">Constraints <span>(optional, comma-separated)</span><input maxLength={640} value={intentConstraints} onChange={(event) => setIntentConstraints(event.target.value)} placeholder="WCAG AA, mobile-first, Stripe" /></label>
        </section>
        <form onSubmit={submitContract} aria-busy={submitting}>
          {compileResult && qualityState && !qualityState.delivery ? <p className="ds-dialog-error" role="status">Choose a delivery target before code generation can start.</p> : null}
          <fieldset className="ds-field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="ds-utility">DELIVERY TARGET</legend><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".65rem" }}><label>Provider<select value={deliveryProvider} onChange={(event) => setDeliveryProvider(event.target.value as DeliveryProvider)}><option value="osgard-cluster">OSGARD Cluster</option><option value="vercel">Vercel</option><option value="netlify">Netlify</option><option value="custom">Custom server</option></select></label><label>Domain (optional)<input value={deliveryDomain} onChange={(event) => setDeliveryDomain(event.target.value)} placeholder="app.example.com" inputMode="url" /></label><label>Supabase project ref (optional)<input value={supabaseProjectRef} onChange={(event) => setSupabaseProjectRef(event.target.value)} placeholder="abcdefghijklmnop" autoComplete="off" /></label></div><small className="ds-field-hint">Connect Cloudflare, hosting and Supabase credentials in Integrations. This wizard stores only public references and never stores secrets.</small>{deliveryIntegrations.length ? <div className="ds-delivery-integrations" aria-label="Connected delivery integrations"><span className="ds-utility">CONNECTED ADAPTERS</span>{deliveryIntegrations.filter((item) => ["cloudflare", "supabase-management", "vercel", "netlify", "hostinger", "contabo"].includes(item.connectorId)).map((item) => <label key={item.id}><input type="checkbox" checked={selectedIntegrationIds.includes(item.id)} onChange={(event) => setSelectedIntegrationIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} /><span>{item.connectorName} · {item.name}</span><small data-status={item.lastTestStatus || "untested"}>{item.lastTestStatus || "untested"}</small></label>)}</div> : <small className="ds-field-hint">No domain or infrastructure adapter is connected yet. Open Integrations to connect one, then return here.</small>}</fieldset>
          {deliveryPreflight ? <section className="ds-dialog-result" aria-label="Delivery preflight"><strong>{deliveryPreflight.ready ? "Delivery target saved" : "Delivery target needs attention"}</strong>{deliveryPreflight.checks.map((check) => <small key={check.id} data-status={check.status}>{check.label}</small>)}</section> : null}
          {compileResult && (compileResult.aiSummary || compileResult.aiComponents?.length || compileResult.aiRisks?.length) ? <section className="ds-dialog-result" aria-label="AI architecture signal"><strong>AI architecture signal</strong>{compileResult.aiSummary ? <span>{compileResult.aiSummary}</span> : null}{compileResult.aiComponents?.length ? <small>Selected components: {compileResult.aiComponents.join(", ")}</small> : null}{compileResult.aiRisks?.length ? <small>Risks to review: {compileResult.aiRisks.join("; ")}</small> : null}</section> : null}
          <label className="ds-field">Название<input required value={contractName} onChange={(event) => setContractName(event.target.value)} placeholder="Например, кабинет партнёра" /></label>
          <section className="ds-brief-starters" aria-labelledby="starter-missions-title"><div className="ds-brief-starters__head"><Lightbulb size={15} aria-hidden="true" /><span id="starter-missions-title" className="ds-utility">STARTER MISSIONS</span><small>Начните с готового вектора</small></div><div className="ds-brief-starters__grid">{starterMissions.map((mission) => <button key={mission.id} type="button" className="ds-brief-starter ds-focus" onClick={() => chooseStarterMission(mission)} aria-label={`Use starter mission: ${mission.label}`} title="Fill the brief with this starting direction"><strong>{mission.label}</strong><span>{mission.brief}</span></button>)}</div></section>
          <label className="ds-field">Результат для проверки<textarea required rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Какой результат должен быть готов?" /></label>
          <p className="ds-dialog-live" role="status" aria-live="polite" aria-atomic="true">{submitting ? "Собираем blueprint…" : compileResult ? "Blueprint готов к проверке." : ""}</p>
          {compileError ? <div className="ds-dialog-error" role="alert"><p>{compileError}</p>{compileResult ? <button type="button" className="ds-dialog-secondary ds-focus" onClick={retryPreview} aria-label="Retry preview" title="Retry preview">Повторить preview</button> : null}</div> : null}
          {previewPlan ? <section className="ds-dialog-preview" aria-label="Blueprint preview"><div className="ds-utility">LIVE PREVIEW / REVISION {previewPlan.revision}</div><div className="ds-dialog-preview-slots">{previewPlan.slots.map((slot) => <article key={slot.id} className="ds-dialog-preview-slot"><strong>{slot.component}</strong><span>{slot.role}</span><small>{slot.states.join(" · ")}</small></article>)}</div><div className="ds-dialog-preview-stages" aria-label="Preview stages">{previewPlan.stages.map((stage, index) => <span key={stage} data-active={index === 0}>{stage}</span>)}</div></section> : null}
          {compileResult ? <div className="ds-dialog-result" role="status"><strong>Blueprint готов: {compileResult.score}/100</strong><span>{compileResult.review ? "Нужна ручная проверка перед публикацией." : "Можно переходить к preview."}</span>{compileResult.contractHash ? <small>Contract evidence: {compileResult.contractHash.slice(0, 12)}…</small> : null}{compileResult.warnings.length ? <small>{compileResult.warnings.length} предупреждения требуют внимания</small> : null}</div> : null}
          {compileResult ? <section className="ds-mission-replay" aria-label="Mission replay"><div><span className="ds-utility">MISSION REPLAY / OSGARD</span><strong>{compileResult.app}</strong><small>{compileResult.productType || "product"} · {compileResult.preset || "futuristic"} · revision {compileResult.revision}</small></div><div className="ds-mission-replay__score"><b>{compileResult.score}</b><span>quality</span></div><button type="button" className="ds-dialog-secondary ds-share-button" onClick={() => void shareBlueprint(compileResult)}><Share2 size={15} /> Share replay</button>{shareStatus ? <p role="status" className="ds-share-status">{shareStatus}</p> : null}</section> : null}
          {compileResult ? <section className="ds-evidence-ledger" aria-label="Evidence ledger"><div className="ds-evidence-ledger__head"><div><span className="ds-utility">EVIDENCE LEDGER</span><small>{evidence.length ? `${evidence.length} recorded checks` : "No checks recorded yet"}</small></div><button type="button" className="ds-focus ds-evidence-ledger__refresh" onClick={() => void refreshEvidence()} disabled={refreshingEvidence} title="Refresh quality evidence" aria-label="Refresh quality evidence"><RefreshCw size={13} aria-hidden="true" className={refreshingEvidence ? "ds-spin" : undefined} /></button></div>{qualityState ? <div className="ds-evidence-ledger__gates" aria-label="Required quality gates">{qualityState.required.map((kind) => { const passed = !qualityState.missing.includes(kind) && !qualityState.stale.some((item) => item.kind === kind); return <span key={kind} data-status={passed ? "passed" : "pending"}><i aria-hidden="true" />{evidenceLabel(kind)}<em>{passed ? "Passed" : "Pending"}</em></span> })}</div> : null}{qualityState?.missing.length ? <p className="ds-evidence-ledger__missing">Перед публикацией нужно пройти: {qualityState.missing.map(evidenceLabel).join(", ")}</p> : null}{qualityState?.stale.length ? <p className="ds-evidence-ledger__stale">Проверки требуют обновления после изменения revision: {qualityState.stale.map((item) => evidenceLabel(item.kind)).join(", ")}</p> : null}{qualityState && !qualityState.missing.length && !qualityState.stale.length ? <p className="ds-evidence-ledger__ready">{qualityState.readyForCodegen ? "Все проверки пройдены. Можно запускать codegen." : "Проверки пройдены. Подтвердите preview для codegen."}</p> : null}{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><i data-status={item.status} aria-hidden="true" /><span><strong>{evidenceLabel(item.kind)}</strong><small>{item.summary}</small></span><em>{item.status}</em></li>)}</ul> : <p>Quality gates appear here as soon as a verified check is captured.</p>}</section> : null}
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
